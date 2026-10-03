# Sync — the data model, and what the server is allowed to know

Tova is going multi-platform: desktop, web and mobile, with notes that follow
you. This is the model everything else inherits, written before the code so the
parts that are hard to change later are argued about first.

Nothing here is built yet. `uid` is, and it is the only piece of it that could
ship on its own.

## The constraint that shapes everything

These are personal journals and work notes. **The server must not be able to
read them.** Not "is trusted not to", not "encrypts at rest" — cannot.

That is a decision with teeth, and most of the awkward parts below follow from
it rather than from anything incidental.

## What already exists

Tova has had vault encryption since before any of this, and it is the right
shape for it:

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| Cipher       | AES-256-GCM, 12-byte nonce, 16-byte tag                                 |
| Content key  | 32 random bytes, independent of any password                            |
| Wrapping     | scrypt N=2¹⁴, r=8, p=1 over a recovery key                              |
| Recovery key | Random letters in groups, normalised on entry so it can be written down |
| At rest      | The wrapped envelope in a marker file; the raw key in the keychain      |
| Pinned by    | `conformance/crypto.json`                                               |

The content key being **independent and wrapped** rather than derived from a
password is what makes the rest workable: the password can change without
re-encrypting a single note, and the recovery key is a second, equal door.

Extending this to a server is adding wrapped copies of the same key. It is not
a new cryptosystem, which is the main reason to be comfortable doing it at all.

## What the server stores

```
notes
  id          uuid        -- the note's uid. Random, and means nothing.
  user_id     uuid        -- Better Auth's user
  ciphertext  bytea       -- AES-256-GCM over the whole note, front matter and all
  nonce       bytea
  version     bigint      -- bumped by the server on every accepted write
  updated_at  timestamptz -- server clock, for ordering only
  deleted_at  timestamptz -- a tombstone, so a delete can propagate
```

That is the whole row, and the shortness is the point. **Title, body, tags,
section, folder and dates are all inside the ciphertext.** The server knows a
note exists, who owns it, roughly how big it is, and when it last changed.

```
key_envelopes
  user_id     uuid
  kind        text        -- 'password' | 'recovery'
  salt        bytea
  envelope    bytea       -- the content key, sealed by a key derived from that factor
```

Two envelopes over one content key. Signing in on a new device fetches both,
unwraps whichever factor the reader can supply, and the key never crosses the
wire in the clear.

```
devices                   -- for revocation and for showing "where am I signed in"
  id, user_id, name, last_seen_at
```

**Better Auth owns identity and nothing else.** It proves who you are. It never
holds anything that decrypts what you wrote. Those are deliberately different
systems, and a breach of the first should not touch the second.

## What this costs

Stated plainly, because each one is a real loss and they are easy to discover
late.

**Server-side search is impossible.** You cannot index ciphertext. Search is
client-side over synced notes, which `src/shared/search.ts` already does — but
it means a device needs the corpus before it can search it. For a personal
vault of thousands of notes that is fine. It would not be fine at a million.

**The server cannot merge.** It cannot read either side of a conflict, so every
merge happens on a client. The server's only job in a conflict is to say _no,
someone moved it_.

**Losing both factors loses the notes.** Password reset restores access to the
account, not to the writing. The recovery key stops being a nicety and becomes
the thing that has to be stored somewhere real.

**Sharing and read-only web access become impossible** without handing over a
key. Signing in on a borrowed machine gets you an empty app until you supply
one.

If any of those is unacceptable, the constraint at the top is the thing to
revisit — not the design under it.

## The key's life, and the screens it needs

Every answer here follows from one decision: the content key is 32 random bytes
that belong to the reader, and a factor only ever wraps it. Nothing derives it,
so nothing re-encrypts a note when a factor changes.

**Signing up** mints the content key on the device, seals it twice — once under
the password, once under a fresh recovery key — and sends only the two
envelopes. The recovery key is shown once, because it cannot be re-derived, and
the screen has to say that plainly enough that somebody writes it down.

**Changing a password** unwraps the envelope with the old password's key and
seals the same content key under the new one. One row changes. No note is
touched.

**Replacing the recovery key** is the same move: unwrap with what the device
already holds, seal again under a new recovery key, overwrite the row. Existing
notes keep opening, and the old recovery key stops working the moment that row
is gone — the unique index on `(user_id, kind)` is what makes it one row and so
makes the swap atomic.

Worth being exact about what "stops working" means: this is revocation by
deletion, not by cryptography. The old recovery key still derives the old
wrapping key, and anyone holding a copy of the old envelope could still open it.
The envelope only ever existed on the server and on that reader's devices, which
is what makes that acceptable — but it is not the same claim as the key being
dead.

**Resetting a forgotten password is the one that surprises people.** The server
can issue new credentials; it cannot re-wrap an envelope, because it has never
held the content key. So after a reset somebody signs in successfully and sees
nothing. The recovery key is the only way back, and entering it unwraps the
content key so the client can seal it under the new password.

That is the trigger for the recovery screen — not a device that cannot unlock,
but a password that was reset. The copy should say so, because "your password
worked and your notes are still locked" is otherwise indistinguishable from a
bug.

**Changing a password is two writes, and neither order is safe alone.** The
password derives both halves — the auth secret the server checks and the
wrapping key it never sees — so changing it means a new credential _and_ a new
envelope. If only the credential lands, the reader signs in and the notes stay
shut. If only the envelope lands, the old password still signs in and derives a
wrapping key that no longer fits. Both failures look identical to the reader and
both need the recovery key to escape, so the two writes have to be one
transaction or the envelope has to roll back.

**Starting fresh after losing a recovery key** mints a new content key under a
new epoch. The old notes stay exactly where they are, sealed, carrying the old
epoch — a client reads the highest epoch it can unwrap and leaves the rest
alone. They are not deleted, because the entire reason a recovery key exists is
that people find things late, and deleting would be the one irreversible step
taken on their behalf on the screen whose premise is that nothing can be done
for them.

**Deleting an account** removes the envelopes, and with them every way of
reading the notes — by the reader, and by Tova, permanently. Export has to come
first and the screen has to say why it is not a formality.

## Conflicts

Last-write-wins loses writing, and a CRDT is a large, locking dependency for a
problem one person with two devices mostly does not have. So:

1. A client sends its edit with the `version` it edited **from**.
2. If the server has moved on, it refuses and returns the newer row.
3. The client decrypts both, merges three ways against the common ancestor, and
   retries.
4. If the merge genuinely conflicts, both survive — one as a copy — and the
   reader is told.

`src/shared/merge.ts` is step 3, and it answers in two ways rather than three:
the merged text, or nothing. **No conflict markers.** Step 4 is what a real
disagreement gets, and a marker left in a file would be a note that silently
stopped being prose — in an editor that renders markdown live, it would not even
look like a warning.

Each side's changes are worked out as stretches of the base they replaced, and
stretches that do not touch are both applied. Two insertions at the same point
do conflict, since neither covers a line and nothing says which goes first; an
insertion at the _edge_ of somebody else's replacement does not, because it sits
beside the change rather than inside it.

`src/shared/lineDiff.ts` already exists and is the companion to a line merge.

**Version history is the floor underneath all of it — on the desktop.** A bad
merge is recoverable there because `backup.rs` and `src/shared/backup.ts` keep
the last ten versions of every note in `.versions`, beside the vault.

**And now on the web too.** The store keeps the text it is about to replace,
ten per note, five minutes apart — the same shape the desktop keeps, with the
same names, so the screen that shows them does not need to know which backend
it is talking to. A merge is written through that store, which is exactly where
the text it replaced has to be caught.

**The server still keeps none**, and that is a decision rather than a gap.
`notes` holds one row per note and updates it in place. What the conflict story
needs is the version a device had _before_ it merged, and the device had it —
so a local history is the whole of what recoverability requires. A history
table on the server would be a different thing: version history as a feature,
readable from any device, and worth doing for that reason rather than for this
one.

`src/shared/notePlan.ts` is the step before any of that: given what the server
sent, what is on disk, and what was last agreed, it says what to do about each
note. Pure, so it is tested without a key or a network. Two of its rules are
decisions rather than deductions, and both are there to lose as little as
possible:

**An edit beats a deletion.** Deleted on one side and written on the other, the
writing wins and the note comes back. Undoing a deletion costs one more
deletion; undoing a lost edit costs the writing. Deletions are tombstones
rather than erasures, so a note returning is the cheap outcome.

**A note missing locally with no tombstone is a missing file, not a deletion.**
Tova reads a folder other things can reach, so a note can vanish to a stray
`rm`, a half-restored backup, or a file sync that has not caught up. Reading
absence as intent would turn any of those into a deletion on every device at
once, so the note is taken back instead.

Collaborative editing would need CRDTs. That is a different product and the
model above does not block ever adopting one.

## The protocol

Two calls.

**Pull** — "what has changed since cursor `n`?" Returns rows with `version > n`,
tombstones included, and the new cursor. Ordering by a server-assigned sequence
rather than a timestamp, because clocks on clients cannot be trusted and
`updated_at` is for display.

**Push** — rows with the base version each was edited from. The server accepts
or refuses each one individually. Refusals come back with the current row so
the client can merge without a second round trip.

Offline is the normal case rather than an edge: the desktop app works with no
network at all today, and that does not change. A device accumulates local
edits and pushes them when it can.

## Where the code goes

The renderer talks to exactly one interface — `window.tova`, with no Tauri
import anywhere in `src/renderer`. **That seam is what makes a web client
cheap**: implement those methods over HTTP instead of over Tauri's `invoke`,
and the entire UI comes along unchanged.

That was an argument until it was tried. Served by plain Vite, opened in an
ordinary browser with no Tauri, and handed a `window.tova` of stubs, the
renderer compiles, mounts and renders its first-run screen. It calls **74**
distinct methods anywhere in the app and **13** to boot. `docs/ROADMAP.md` has
the breakdown.

The Rust stays desktop-side, where the filesystem and the keychain are — **and
where the desktop's HTTP goes too.**

A webview asking `tova.so` from `tauri://localhost` is a cross-origin request,
so the server would have to answer it with `Access-Control-Allow-Origin:
tauri://localhost`. That origin is not this app's. It is _every_ Tauri app's,
and opening it would let anything built with Tauri on that Mac call the server
with the reader's session attached.

From Rust there is no CORS, because CORS is a rule browsers apply to
themselves, and no `SameSite` either — so the session cookie is simply stored
and sent back the way `curl` would, encrypted by the keychain on the way to
disk. The session never enters the webview, which is where an injected script
would be. The
server is TypeScript — Neon, Drizzle, Zod, Better Auth — because what it does
is store, authenticate and reconcile, and none of that wants the 18,000 lines
of macOS integration the desktop app carries.

## Decided

**Ids are minted at first sync, not swept.** A note written before ids existed
gets one as it goes up. A sweep would rewrite the files of everyone who never
turns sync on, for their trouble, and they would get nothing from it.

**One repo.** `src/shared` is 4,238 lines the web client cannot do without —
tags, markdown spans, search, tables, front matter. In one repo that is an
import; in two it is a published package with versions and release steps,
forever.

The shape is frunk's, which already runs this way: one `package.json`, no
workspaces, and a build script per target. `build` makes the renderer for
Tauri; `build:web` makes the Astro site for Vercel; both read the same `src/`.
`src-tauri` is simply not in the web build, and Vercel takes a root directory.

**The key lives in IndexedDB as a non-extractable `CryptoKey`.** WebCrypto can
import it so that script — ours or an attacker's — can use it to decrypt and
cannot read it out, and IndexedDB stores that object as it is. It cannot be
exfiltrated.

The residual risk is exact and worth writing down: an XSS hole in the web app
could decrypt notes _in that session_ without ever stealing the key. The
editor renders what the reader wrote, so that surface is the one that matters,
and "forget this device" has to clear the key.

In-memory only, with the password re-entered every session, is stricter and
is what to fall back to if that surface ever looks shaky.

**A third factor is coming: the device itself.** On a phone, typing a long
password every time somebody picks it up is not a thing anybody will do, so the
answer is Face ID — and it does not need native code. WebAuthn's `prf`
extension derives a stable secret from a passkey and releases it only behind the
platform authenticator. That secret wraps the content key exactly as a
password-derived key does, which makes it a third envelope kind beside
`password` and `recovery`, and the schema already allows for it.

Two consequences worth stating before it is built. PRF wants iOS 18 and Safari
18, so **the password stays the floor** — the factor every device has — rather
than becoming optional. And because the biometric envelope wraps the content key
rather than anything derived from the password, **an enrolled device still opens
after a password reset.** That is a way back in that costs no recovery key, and
it is the opposite of what a first draft of the copy claimed.

**And it is stronger than the thing it sits beside.** "Keep this device
unlocked" stores a non-extractable `CryptoKey`: script cannot read it out, and
any script in this origin can _use_ it, with no gesture at all. That is exactly
the residual risk named above. A PRF envelope cannot be opened without a
biometric gesture, so the same XSS hole reaches nothing. Where PRF is available
it is the better answer for staying unlocked, on a desk as much as on a phone,
and the non-extractable key is what is left for everywhere else.

**And it is off unless the reader asks.** That decision came later than the one
above and refines it: where the key lives is IndexedDB, whether it is written
there at all is a question. `CLAUDE.md` draws the line at anything costing the
reader something they should consent to — a download, a connection, their
writing leaving the machine, real disk — and a key that decrypts every note
sitting on disk is squarely on that side of it. So the sign-in form has an
unticked box, "Keep this device unlocked", and signing in without it leaves the
key in memory for that page and nowhere else.

"Forget this device" is what ends it, and it is the only thing that does.
Signing out does not: a session is an auth question and cannot reach back and
lock a key a device already holds.

**Local `.md` files stay the source of truth for anyone who never turns sync
on.** Tova reads a folder today and that does not stop being true. Sync is a
thing you opt into, not the new foundation under everyone.

## Still open

- Nothing, until the schema is built and the first of it is wrong.

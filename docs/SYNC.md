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

## Conflicts

Last-write-wins loses writing, and a CRDT is a large, locking dependency for a
problem one person with two devices mostly does not have. So:

1. A client sends its edit with the `version` it edited **from**.
2. If the server has moved on, it refuses and returns the newer row.
3. The client decrypts both, merges three ways against the common ancestor, and
   retries.
4. If the merge genuinely conflicts, both survive — one as a copy — and the
   reader is told.

`src/shared/lineDiff.ts` already exists and is the companion to a line merge.
Version history is the floor underneath all of it: a bad merge is recoverable
because every version is kept.

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

The renderer talks to exactly one interface — `window.tova`, 79 methods, with
no Tauri import anywhere in `src/renderer`. **That seam is what makes a web
client cheap**: implement those methods over HTTP instead of over Tauri's
`invoke`, and the entire UI comes along unchanged.

The Rust stays desktop-side, where the filesystem and the keychain are. The
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

**Local `.md` files stay the source of truth for anyone who never turns sync
on.** Tova reads a folder today and that does not stop being true. Sync is a
thing you opt into, not the new foundation under everyone.

## Still open

- Nothing, until the schema is built and the first of it is wrong.

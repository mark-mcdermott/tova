# Roadmap

What is agreed and not yet built. `SPEC.md` is what Tova is meant to be,
`BUILD_PHASES.md` is the order it was built in, and `PROGRESS.md` is the record
of what landed — this is the only forward-looking one of the four.

Nothing here is a promise about when. The order within each section is rough
priority; the sections themselves are not ranked against each other.

---

## Next

### Live markdown is done, and so is the export

Checkboxes render as boxes you can click. Thematic breaks were already handled.
Tables lay their own cells out and draw a rule under the header. The HTML export
and the PDF render them too, on both backends, which was the last of it.

---

## Loose ends

Small, known, and each one found in passing rather than reported.

- **A Dependabot alert on `glib` that cannot be closed from here, and does not
  reach the product.** Alert 36, moderate: unsoundness in the `Iterator` and
  `DoubleEndedIterator` impls for `glib::VariantStrIter`, wanting `glib >= 0.20`
  against the 0.18.5 in `Cargo.lock`.

  It arrives through `atk` → `gtk` → `muda`/`tao` → `tauri`, which is the Linux
  windowing stack. `cargo tree -i glib` finds no dependents at all on macOS and
  only finds that chain under `--target all`, so the shipped app — Cocoa, not
  GTK — never contains the crate. CI compiles it, because CI is the Linux job.

  It is also not movable: `cargo update -p glib --precise 0.20.0` is refused
  because `gtk 0.18.2` requires `glib ^0.18` and `tauri 2.12.1` pins that gtk.
  It closes when Tauri moves to gtk 0.19 or later, and not before.

  Dismissed as "not used" on 2026-10-01, which silences this advisory and no
  other — a different one against `glib` would still open an alert. The fix
  arrives on its own either way: Dependabot's version updates are a separate
  system from its alerts, so the weekly cargo group PR carries the new `glib`
  whenever Tauri moves. Worth a look again if Linux ever becomes a target Tova
  ships; until then it is not work.

- **Eighteen react-hooks warnings are parked, not resolved.** ESLint runs now,
  and the first thing it had to say was about the editor. react-hooks v7 is the
  React Compiler's lint suite, and `recommended` carries fourteen rules beyond
  the two it used to mean.

  Fifteen of the eighteen are one pattern, almost all in `useCodeMirror`: the
  view is built once, so every handler reaches the latest props through a ref
  that is written during render. The compiler reads that write as impure. It is
  the documented way to hold a non-React library, and the file says so where it
  does it — but `useEffectEvent` is the answer React now gives, and it is worth
  taking deliberately rather than under a linter's deadline. The other three are
  `set-state-in-effect` twice and one `purity`.

  They are set to `warn` in `eslint.config.mjs`, named individually rather than
  blanket-disabled, so they stay visible and stay off the failing path. Going
  through them is editor work, not tooling work.

- **Two conformance fixtures are read by the Rust alone, and both correctly.**
  `safe-storage` is Chromium's OSCrypt format and `window` is where the window
  was left — neither has a TypeScript counterpart to hold, because both moved
  out of the renderer when Electron did.

  The other eleven are read by both. Six of them were not: `markdown`, `screen`,
  `blogs`, `publish`, `search`, `posts` and `text` each said "both read this"
  while only one side did, so a change on the TypeScript side would have left
  the Rust passing against an answer this side had stopped giving. Each new test
  was tampered against rather than trusted for passing, and every one of them
  caught what it was supposed to.

  Two things fell out of that worth keeping. `publish`'s `hashContent` cases
  have no TypeScript counterpart at all — the hashing moved into the Rust — so
  that section stays one-sided on purpose and the readme says so. And the
  `search` and `markdown` readmes both claimed a regex class was ASCII "without
  the u flag": JavaScript has no flag that makes `\w` or `\b` Unicode-aware, and
  `\S` is Unicode-aware already. The difference is Rust's regex crate reading
  its classes as Unicode by default, which is the direction it actually runs.
  Found by a tamper that added the flag and changed nothing.

- **`pnpm run release:grammar` has never been run**, so Harper's dictionary is
  still fetched from jsdelivr rather than from a Tova release. The script exists
  and the expected size and hash are already pinned in `grammar.rs`.

---

## Platform

### Windows

Four things are stubbed: PDF export, spellcheck, safe storage and the account
photo. Safe storage is the blocker and the others are ordinary work — blog
tokens have nowhere encrypted to live on Windows, and shipping them in cleartext
is not an option.

### Multi-platform, with sync

Decided: desktop, web and mobile, with sync, accounts, and notes the server
cannot read. `docs/SYNC.md` is the model — what the server stores, what that
costs, and the decisions still open.

The stack is the one every other project here uses: Neon, Drizzle, Zod, Better
Auth, Astro on Vercel, Tailwind. The Rust stays desktop-side, where the
filesystem and the keychain are.

**Done:** every note now carries a `uid` that survives a rename and a move.

**Done since:** the schema in Neon, Better Auth over it, the envelope
endpoints, the two sync calls, the browser-side flows, and the screens they
drive — sign up, sign in, recover after a reset, finish an interrupted password
change, and the honest dead end when a recovery key is gone.

**Done since:** somewhere for the content key to live between page loads — a
non-extractable `CryptoKey` in IndexedDB, behind an unticked box, with "forget
this device" to end it.

**Done since:** the account screen — change a password, replace a recovery key,
forget this device, sign out — behind a password, with the session checked
server-side so somebody not signed in never receives the page.

**Done since:** `notePlan.ts`, which decides what a sync does with each note
— the step before the merge, and pure enough to test without a key.

**Done since:** `merge.ts`, the three-way merge a conflict needs — merged text
or nothing, never a marker.

**Done since:** `syncCycle.ts`, which is one sync end to end against two ports
— a store and a transport — and the bug that fell out of wiring the real cipher
to the real schema for the first time. The nonce rule in `sync.ts` described an
eleven-byte nonce; `seal` makes twelve-byte ones, so the live endpoint would
have refused every genuine push. It survived a run against the real database
because the probe hand-wrote a nonce to match the rule instead of sealing
anything.

**Version history is on the web now**, which is what the conflict story was
leaning on. The store keeps the text it replaces — ten per note, five minutes
apart, named the way the desktop names them — and `backups.listVersions` and
`readVersion` answer for real. The server still keeps none, deliberately: what
a merge needs to be recoverable is the version the device had before it, and
the device had it.

**Done since:** the web's store and transport, and the first sync that actually
ran — a probe account against the real database, through the whole stack: a
note pushed encrypted, a second device pulling it back decrypted, two edits on
different lines merged, and two edits on the same line kept as both.

**The web client's bet has been tested, and it holds.** `SYNC.md` has claimed
from the start that `window.tova`'s surface is the seam that makes a web client
cheap — implement it over HTTP and the entire UI comes along with no UI work.
That was an argument. It is now a measurement.

The renderer was served by plain Vite, opened in an ordinary browser with no
Tauri anywhere, and given a `window.tova` of stubs. It **compiles, mounts and
renders**: the first-run screen, logo and all, pixel for pixel.

```
74   distinct bridge methods the renderer calls anywhere
13   it calls to boot
14   to boot without an unanswered call (notes.today was the last)
```

The 74 break down as preferences 23, notes 20, blogs 10, spellcheck 7, backups
4, app 3, session 2, publish 2, and one each of images, grammar and events.
Blogs and publish are 12 of those and are deferred under the no-blog-at-first
scope; spellcheck is the browser's own on the web and mostly answers itself;
grammar is the opt-in dictionary. So the real work is **notes and
preferences**, and notes is the half that already has a store, a transport and
a sync behind it.

**And it is built.** `web/lib/bridge/` is the whole surface, typed as
`TovaBridge` so the compiler says when a method is missing rather than a screen
saying it to somebody. `/app` mounts `src/renderer/App` unchanged — no fork, no
second copy — and the sidebar, the sections, the tags, the background and the
editor pane all come up in a browser.

Refusals carry which of two reasons applies, and the difference is the roadmap:
**unavailable** is a thing a browser will never do (Finder, a folder picker,
relaunching), **not yet** is a thing that will exist. They look identical in a
stack trace and mean opposite things to whoever decides what to build next. The
app renders a refusal in its own error presentation — "notes.today is not built
on the web yet" — which is how the next piece announces itself.

**The first-run question is a desktop question, and the web does not ask it.**
`CLAUDE.md` says what earns that question its place: it gathers the two costs
that already exist — the grammar dictionary's 15MB and the update check's
connection — into one moment. A browser has neither. There is no update check,
because the page open in front of somebody _is_ the latest one, and grammar is
not built there, so there is nothing to download.

A question that gathers nothing is the second first-run question that document
says to resist, and it would be asking it in copy about a Mac. So `greeted`
starts true on the web: not because anybody was greeted, but because there is
nothing left to ask. When grammar is built for the web it arrives the way
everything that costs something does — off, in Settings, discoverable.

**And the notes model turned out not to be a gap at all.** The renderer
addresses a note by a vault path and the sync keys one by a uuid, and nothing
had to be invented to join them: the desktop already writes `title`, `section`,
`folder`, `tags`, `favorite` and `uid` into front matter, so everything needed
to place a note already travels inside the ciphertext. `restoreLocation` turns
that into a location and `toNoteId` turns that into the path. **A path on the
web is derived, not stored** — rename a note and its id moves, exactly as it
does on the desktop where the file is renamed under it.

A note can now be written in a browser, and it lands in IndexedDB as markdown
the desktop would read:

```
---
title: A little room to think
section: notes
uid: 15b3076e-8047-44b4-9168-9d05dc07efe7
---
```

One thing does not travel, and it is worth knowing rather than discovering.
The desktop reads `createdAt` and `updatedAt` off the filesystem, and it
rebuilds front matter from the keys it knows when it saves — so a key the web
added would be dropped the next time the desktop touched that note. The times
are kept beside the note on this device instead, which makes them "when this
browser last saw it change". For sorting a list that is what a reader means
anyway.

**`NoteApi` is done.** Every method: today's note, search, moves, folders,
sections, permanent delete and export. Nothing in it refuses any more except
`exportPdf`, which is Chromium printing to a path a browser never learns.

Four of those needed a decision rather than a port:

- **A daily note is named by its date**, which is what makes it _that day's_
  rather than a note that happens to be in Daily. The desktop gets the date
  from the filename; the web has no filenames, so `parseDailyTitle` reads it
  back out of the title. One honest limit falls out: retitle a daily note on
  the web and it stops being that day's, where on the desktop the filename
  would hold it.
- **Deleting for good empties the note and keeps the tombstone.** The row has
  to stay or the deletion stops travelling — a note absent from a pull is
  indistinguishable from one that never existed, and the other device pushes it
  straight back. What goes is the writing, which is what somebody asked to be
  rid of.
- **An empty folder is remembered locally.** A folder here is derived from the
  notes in it, so one with nothing in it has nowhere to exist. The name is kept
  on this device until a note lands in it, and then the note carries it — a
  name travelling ahead of anything to put in it would be a sidebar entry
  nobody on the other device had asked for.
- **Export hands over a file and returns its name, not a path.** A browser
  never learns where a download went.

**And a sync runs on its own.** `/app` signed in on a device holding its key
pushes what was written and pulls what arrived — verified against the real
database, where a daily note the web app made turned up encrypted at version 36
with nothing readable in it.

`syncRunner.ts` is only _when_: shortly after a write, every minute otherwise,
never two at once, and a change arriving mid-sync sends it round again rather
than waiting for the timer. A failure backs off by doubling, and one success
forgets the whole history. Missing any of a session, a kept key, or storage is
not an error — it is Tova working locally, which is what it does on a device
nobody has signed in on.

**Two signals, not one.** `localChanged` is this tab saying it wrote;
`vaultChanged` is a sync saying it took something. `EventsApi.onNotesChanged`
is documented as changes made elsewhere, and handing it this tab's own writes
would reload the renderer after every keystroke it had just handled.

**The desktop has an account.** `SyncApi` is a fifth thing both backends
answer — sign in, sign out, who, pull, push — by routes with nothing in common:
the web through Better Auth's browser client, the desktop out through Rust.

**And now it is a peer.** `bridgeNoteStore` is a `NoteStore` over
`window.tova.notes` — the inverse of the web, where the store is underneath the
notes API rather than on top of it. The cursor and the agreed map live beside
the preferences, written beside and renamed over so a crash leaves the old
state rather than half the new one. The content key is keychain-encrypted next
to the session, and signing out takes it first.

`signal.ts` and `syncRunner.ts` moved to `src/shared`, where they belonged: the
desktop was importing them from `web/lib`, which is backwards.

What is left is a way to _sign in_ on the desktop. Everything behind it is
wired and does nothing until somebody does — which is not a failure, it is Tova
as it has always been, a folder of markdown on one Mac.

**Next, in order:** the
desktop's store, which is the same interface over markdown files; something to
call a sync from, on a schedule and on a change; and version history on the
web, since the desktop's `.versions` is the floor the conflict story leans on
and the web has none; which is files on the desktop and IndexedDB on
the web; deleting an account, which is the one screen in this set
that is not built and the one that needs the most care. With end-to-end
encryption, removing the envelopes removes every way of reading the notes — by
the reader and by Tova, permanently — so export has to come first and there is
no export on the web yet. That ordering is the work, not the delete button;
which is a password change and a new recovery key over flows that already exist;
all notes getting a `uid` at first sync rather than in a sweep; the web client,
which is `window.tova`'s 79 methods over HTTP and no UI work at all; then mobile,
which is the web client in a native shell.

**Mobile has mocks**, at revision three. Ten screens, kept outside the
repository with the rest of the branding, and the handoff reads as a
specification rather than a description: the PWA and PRF, an enrolled device
surviving a password reset, and lock-versus-forget as two different acts. Every
correction from the first two rounds is in.

They were drawn before the shell was decided, so the first of those three is
out of date and the other two are not: the screens are right, and the unlock
behind them is the platform authenticator directly rather than through PRF.

The conflict screen matches `syncCycle.ts` — both notes kept, the original
keeping its id, the incoming version becoming the copy — which is worth
recording because it was drawn before the code was read.

Two things it leaves open:

- **"Forget this device" has to clear the local notes, not only the key.** The
  handoff says it does not delete notes, which is true of the server and
  dangerous if read as the cache: `noteStore` keeps notes in IndexedDB as
  plaintext, because plaintext is what the reader is there to see. Dropping the
  key alone removes the lock and leaves the contents. `forget.ts` is now that
  one act, and it clears the notes first — a half-done forget that kept the key
  is a key with nothing to open, and the other order is readable writing with no
  lock in front of it.
- **PRF should probably replace "keep this device unlocked" everywhere, not
  only on a phone.** `SYNC.md` has the argument: a non-extractable `CryptoKey`
  can be used by any script in this origin with no gesture, and a PRF envelope
  cannot be opened without one.

**Done since: the shell fits a phone.** Below 768px the sidebar stops being a
column and becomes a panel over the writing, with the control that brings it
back at the head of the nav row and the writing itself as the way out of it.
The breakpoint is one number in two languages that cannot read each other, so
the test reads the stylesheet and fails when they drift. Safe areas are read
once and taken from there, which is what `viewport-fit=cover` is for.

**Done since: three destinations and a listing to open on.** `IndexTarget`
gains `recent` — everything you could still open, trash excluded, which is the
one listing with no place of its own and so the one a new note cannot take its
section from. The tab bar is Notes, Daily and Settings, and it is not on the
editor: the mocks give that screen the formatting controls and the keyboard,
and two bars at the foot of a phone is most of the page gone. The listing
itself was giving its titles 47px of a 375px screen, with the date taking 117
of them, so a row is read down there rather than across.

Daily opens today's note rather than the week strip the mocks draw, which is a
screen of its own and not built. The way back out of a note is the breadcrumb
that was already there — the first crumb is a link to the listing the note sits
in, which is a screen with the row on it. The mocks draw that as `‹ Notes`,
which is the same act with a clearer affordance, and not a missing one.

**Done since: the keyboard is in front of the page, and the page knows.** iOS
does not shorten the layout viewport when the keys open — it draws them over
the bottom of it — so the last lines of a note and the formatting row were
behind the keyboard, and CodeMirror scrolling the cursor into view scrolled it
into a part of the page nobody could see. `visualViewport` is the half that
knows, and what it measures is published as `--keyboard-inset` rather than as
React state, since what needs it is a padding and not a re-render per frame of
an animation.

Two edges are worth knowing. A negative `offsetTop` is the page being pulled
past its own top, which is a rubber band and never a keyboard; counting it
reported a covered strip on a screen with no keys on it. And iOS zooms the
page when it focuses a field set under 16px, and never zooms back — the size
preference goes down to 12, so a phone has a floor rather than an override,
and anything larger is left alone.

This is measured, tested and seen to move the toolbar by exactly what it
claims in a browser. It has not been in front of a real keyboard.

**Mobile is the web client in a Capacitor shell**, and the app stores are what
decided it. This said PWA until the stores became a goal, and a PWA cannot be
one: Apple does not accept them, and Play takes one only as a trusted web
activity, which is a wrapper by another name. Something has to wrap it, so the
only question left is which shell.

Not Tauri, and for the same reason as before rather than a new one. Tauri 2
does target iOS and Android and that would have been the answer if web were not
happening — but Capacitor wraps the build that already exists. `web/lib/bridge/`
is the whole surface over IndexedDB and HTTP, running in a browser today. A
Tauri port would mean compiling `src-tauri` for two more platforms, and the
parts of it that matter on a phone are exactly the parts that do not transfer:
`safe_storage` is the macOS Keychain and the store underneath it is files on
disk. That is porting the half that needs rewriting to get a shell the app does
not need.

It is additive rather than a fork. Both shells are a webview rendering the same
React and the same CodeMirror, and the seam is already in the types: `platform`
answers `"web" | "desktop"` and gains `"mobile"`, where the mobile bridge is the
web bridge with three or four capabilities swapped for native ones.

**And it takes a bet off the table rather than adding one.** Face ID looked
like the thing that would reopen the Tauri question and it never was — the
Keychain is out of a PWA's reach, but WebAuthn's `prf` extension is not, and it
gives the same property: a secret released only behind the platform
authenticator. In a shell, though, the Keychain is not out of reach either.
Secure storage and the platform authenticator are there directly, which is what
the Mac already has, with nothing resting on how widely PRF is implemented or
how well a passkey reads to somebody who did not ask for one. PRF stays the
answer in a browser, where it is the only one. What should not happen is
carrying it into the shell: WebAuthn inside a webview wants associated domains
and has no presentation context of its own, so PRF under Capacitor is the worst
of both.

**The shell is the cheap part, and not where the time goes.** That is
CodeMirror on a touch keyboard — the viewport under a virtual keyboard,
scrolling the cursor into view above it, composition from autocorrect and an
IME, selection handles, anything that has to sit between the keyboard and the
text. The risk is identical for a PWA, a Capacitor build and a Tauri one,
because all three are the same webview, and ten screens of mocks do not reduce
it. Weeks there, days on the wrap.

Three things the stores add to the list above rather than to the end of it:

- **Deleting an account stops being a loose end and becomes a gate.** Apple
  requires in-app deletion of any account an app can create. The ordering
  already recorded holds — export first, because removing the envelopes removes
  every way of reading the notes — which makes it export, then deletion, then a
  submission.
- **A wrapper around a website is refused under 4.2**, and Tova is not one: it
  writes, stores and reads with no account and no connection. What that asks is
  that nothing on a phone requires signing in to do anything, which is the same
  line the first-run paragraph arrives at from the other side.
- **Sync, if it is ever paid, is paid through Apple** under 3.1.1 when it is
  sold in the app. That shapes the account model, so it is a decision to make
  before a paywall exists rather than after. The rules on linking out have been
  moving; read them at the time.

Reviewer access and export compliance are the other two forms — an
end-to-end-encrypted app needs a demo account somebody can actually get into,
and AES-256-GCM needs the encryption declaration answered.

**The ordering does not change.** Build the mobile web client, open it in
mobile Safari, wrap it after. The two paths share nearly everything — the
layout, the touch editor, the unlock design, a sync running on a phone — and
nothing in the client is wasted if a store comes later or never. Play is the
lower-friction half of it when it does.

---

## Releases

`main` is ten commits past the published `v1.0.0` tag. None of them is urgent on
its own, which is the argument for a `v1.0.1` rather than against one: the
update path is worth exercising on a release where nothing depends on it
working.

---

## Not on this list

Dropped rather than deferred, and listed here so they are not proposed again:
focus mode and folder reordering. `SPEC.md` has the full "What's Cut vs Xin"
table.

`PROGRESS.md` also records a theme picker as dropped. It was built afterwards —
light, dark and system, each with its own background — so that line is history
rather than a decision still standing.

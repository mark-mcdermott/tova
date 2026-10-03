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

**Also open: version history is a desktop feature and `SYNC.md` was treating it
as a guarantee.** The desktop keeps ten versions per note in `.versions`; the
server keeps none and the web keeps none. A conflict strategy that leans on "a
bad merge is recoverable" needs that to be true on every backend, and it is
true on one.

**Done since:** the web's store and transport, and the first sync that actually
ran — a probe account against the real database, through the whole stack: a
note pushed encrypted, a second device pulling it back decrypted, two edits on
different lines merged, and two edits on the same line kept as both.

**Next, in order:** the desktop's store, which is the same interface over
markdown files and the `window.tova` bridge; something to call a sync from, on
a schedule and on a change; and version history on the web, since the desktop's
`.versions` is the floor the conflict story leans on and the web has none; which is files on the desktop and IndexedDB on
the web; deleting an account, which is the one screen in this set
that is not built and the one that needs the most care. With end-to-end
encryption, removing the envelopes removes every way of reading the notes — by
the reader and by Tova, permanently — so export has to come first and there is
no export on the web yet. That ordering is the work, not the delete button;
which is a password change and a new recovery key over flows that already exist;
all notes getting a `uid` at first sync rather than in a sweep; the web client,
which is `window.tova`'s 79 methods over HTTP and no UI work at all; then mobile,
which is the web client as a PWA.

**Mobile has mocks**, redrawn 2026-10-03 after a first pass. Eight screens now,
kept outside the repository with the rest of the branding, and the three gaps in
the first set are closed: a lock screen, a Face ID enrolment screen, and a sync
status screen that explains a conflict copy. The notes list carries a `Synced`
chip and badges the copy `Conflict copy` beside its `Original`. Settings gained
an Unlock & Security group.

The conflict screen matches what `syncCycle.ts` does, which is worth recording
because it was drawn before the code was read: _"Both versions were saved.
Nothing was overwritten"_, with **theirs** as the copy and the original keeping
its id.

Three things to fix before any of it is built:

- **The enrolment copy says the key is "stored in this device's Keychain".**
  A PWA cannot reach the Keychain; the web path is WebAuthn's `prf` extension
  over storage the browser will not read back. The copy and the decision below
  have to agree, and right now they do not — making the copy true as written is
  choosing a Tauri build.
- **"Face ID doesn't recover notes after a password reset" is false on an
  enrolled device.** The biometric secret wraps the content key, which is
  independent of the password, so a phone that already has Face ID set up opens
  after a reset. That is a way back in rather than a caveat, and better than
  what the copy promises. A _new_ device still needs the password or the
  recovery key.
- **There is no way to turn Face ID off.** Settings has "Lock Tova now", which
  drops the key from memory so Face ID can re-open it. Nothing removes the
  stored key, which is the web's "forget this device" and the only thing that
  ends the risk. It belongs on the Face ID screen.

Minor: "Preview reconnection" on the sync screen is a mock affordance rather
than a control.

Mobile is **not** a Tauri port. Tauri 2 does target iOS and Android and that
would have been the answer if web were not happening — but once a web client
exists, mobile rides on it for nearly nothing.

Face ID looked like the thing that would reopen that, and it is not. The
Keychain is out of a PWA's reach, but WebAuthn's `prf` extension is not, and it
gives the same property: a secret released only behind the platform
authenticator. A Tauri build comes back on the table only if PRF turns out to be
too thin in practice — too few devices, or a passkey story readers cannot
follow.

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

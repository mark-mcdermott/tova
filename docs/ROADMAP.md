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

- **Eight conformance fixtures are read by the Rust alone.** Each one's readme
  says "both read this" and for these eight only one side does, so a change on
  the TypeScript side leaves the Rust passing against a stale answer and the two
  backends quietly disagreeing. `markdown.json` was in this list until a
  tampering run found it: dropping the alignment style from the HTML export
  changed several answers and every TypeScript test still passed.

  Read by both: `crypto`, `markdown`, `preferences`, `rules`, `tags`.

  Read by the Rust alone: `blogs`, `posts`, `publish`, `safe-storage`, `screen`,
  `search`, `text`, `window`.

  Some of those are probably Rust-only by nature — `safe-storage` is the
  keychain and has no TypeScript counterpart to hold — so this is eight to look
  at rather than eight to fix. The ones with an obvious twin in `src/shared`
  (`screen`, `search`, `blogs`, `posts`, `publish`) are the ones to start with.
  The pattern to copy is `markdown.conformance.test.ts`, and the way to know it
  earned its keep is to tamper the TypeScript and watch it fail.

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

**Next, in order:** somewhere for the content key to live between page loads —
a non-extractable `CryptoKey` in IndexedDB, per `SYNC.md`, since every flow
currently ends holding it in memory and nothing persists it; the account screen,
which is a password change and a new recovery key over flows that already exist;
all notes getting a `uid` at first sync rather than in a sweep; the web client,
which is `window.tova`'s 79 methods over HTTP and no UI work at all; then mobile,
which is the web client as a PWA.

Mobile is **not** a Tauri port. Tauri 2 does target iOS and Android and that
would have been the answer if web were not happening — but once a web client
exists, mobile rides on it for nearly nothing.

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

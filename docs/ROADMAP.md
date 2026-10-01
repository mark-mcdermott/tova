# Roadmap

What is agreed and not yet built. `SPEC.md` is what Tova is meant to be,
`BUILD_PHASES.md` is the order it was built in, and `PROGRESS.md` is the record
of what landed — this is the only forward-looking one of the four.

Nothing here is a promise about when. The order within each section is rough
priority; the sections themselves are not ranked against each other.

---

## Next

### Tip jar

The stated next feature. The app-side work is small — a link, a place to put it,
and some restraint about how loudly it asks. The real decision is in-app versus
site-only: outside the App Store a link to an existing account is all it takes;
inside it, the same thing becomes an in-app purchase with Apple's cut and a
review process attached.

Account setup is not a code task and is blocked on that being dug out.

### Live markdown: tables are the one still missing

The audit is done. Checkboxes were the reported gap and now render as boxes you
can click; thematic breaks were already handled. **Tables are parsed and never
decorated**, so they sit in the editor as raw pipes while everything around them
renders.

The tree is all there — `Table`, `TableHeader`, `TableRow`, `TableCell`,
`TableDelimiter` — because the editor parses with `base: markdownLanguage`
rather than the CommonMark default. Nothing in `markdownDecorations.ts` looks at
any of it.

It is also the hardest of the constructs, and worth saying why before anyone
picks it up expecting an afternoon. Every other decoration here changes how a
run of text is painted. A table wants a grid: cells aligned into columns whose
widths depend on the longest cell in each, across lines that CodeMirror draws
independently of one another. Decorations cannot restructure lines into a grid,
so the real choices are a widget that replaces the whole block — which takes the
text out from under the cursor and ends live editing inside it — or padding the
cells so the pipes line up as a monospace grid, which keeps editing intact and
looks much plainer.

The second is the one that fits this editor. Worth settling deliberately rather
than discovering halfway in.

---

## Loose ends

Small, known, and each one found in passing rather than reported.

- **Two literal `✕` characters** remain, in the note search and the publish
  toast. Same class as the trash-row bug that was fixed: they only ever rendered
  because `✕` happens to be in the font, unlike the `⤺` that was not.

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

  Worth a look again if Linux ever becomes a target Tova ships. Until then the
  decision to make is whether to dismiss the alert as not-affected or leave it
  standing as a reminder — the one thing not worth doing is treating it as
  actionable work.

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

- **`pnpm run release:grammar` has never been run**, so Harper's dictionary is
  still fetched from jsdelivr rather than from a Tova release. The script exists
  and the expected size and hash are already pinned in `grammar.rs`.

- **`SPEC.md` still says Electron.** It describes the stack Tova was specified
  against, not the one it runs on.

---

## Platform

### Windows

Four things are stubbed: PDF export, spellcheck, safe storage and the account
photo. Safe storage is the blocker and the others are ordinary work — blog
tokens have nowhere encrypted to live on Windows, and shipping them in cleartext
is not an option.

### Multi-platform, with sync

The large one. Desktop, web and mobile, sharing notes. Three platforms without
sync is three places the notes are not.

The local-only constraint is lifted: plain markdown files in a folder stay a
reader's _option_ rather than the foundation, which means the canonical store
can be a database and sync no longer has to reconcile a server against files
being edited underneath it.

Keep React, CodeMirror and the hand-written CSS. `src/shared/` already holds the
logic that matters, so another client needs a storage layer and OS integration
rather than a rewrite. Capacitor is the likely answer for iOS and Android.

**The first piece, and it can ship before any of the rest exists: a note needs
an id that does not change.** Identity today is the vault-relative path, which
moves when a note is renamed — `notes.rs` says so in a comment. That is fine on
one machine and fatal across two, because a rename becomes a delete and a create
and no client can tell which note is which. A ULID assigned at creation and
written into front matter leaves every file exactly where it is and makes the
path cosmetic.

The rest of the model, in short: the body stays one markdown string rather than
being decomposed into blocks, because blocks would break the editor, the parsing
in `src/shared/` and the blog publishing while making conflicts harder to
resolve, not easier; `createdAt` and `updatedAt` become fields rather than
filesystem metadata, which does not survive sync; and conflicts are last-write-
wins on metadata with a three-way line merge on the body, falling back to
keeping both copies. Not a CRDT — the real concurrency is one person on two
devices, rarely at once, and version history is already the floor beneath a bad
merge.

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

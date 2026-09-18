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

### A note title should shrink rather than overflow

A title that outgrows its width should step its font size down a little at a
time so the whole of it stays visible, with a floor past which it stops.

Today it does neither. `.title-input` is an `<input>`, so there is no wrapping
to fall back on: it scrolls, and the beginning of a long title slides out of
sight to the left while you are still typing it.

Two things shape the work:

- The edge that bites is not the window. The title is held to
  `max-width: var(--measure)` — the same measure as the prose — which is
  narrower than the pane it sits in.
- The title face is whatever the reader uploads, so the fit has to be measured
  against the computed font rather than guessed from a character count.
  `--title-overhang` is already in `em` and scales down on its own.

Worth settling first: `SPEC.md` answers this question differently. It asks for a
title that **wraps to multiple lines**, on the grounds that a tall multi-line
title looks like a book cover. Wrapping and shrinking are two answers to the
same problem and only one of them can be built; wrapping also means the title
stops being an `<input>`, which is a larger change than a font size that steps.

### Live markdown, everywhere it should be

Markup renders when the cursor is elsewhere and returns to raw text when the
cursor is on it. That holds for bullets, headings, bold, italic, strikethrough
and code — and not for checkboxes, which stay as `- [ ]` wherever the cursor is.

Audit the rest against the same rule. Tables and thematic breaks are the two
most likely to have been missed.

---

## Loose ends

Small, known, and each one found in passing rather than reported.

- **Two literal `✕` characters** remain, in the note search and the publish
  toast. Same class as the trash-row bug that was fixed: they only ever rendered
  because `✕` happens to be in the font, unlike the `⤺` that was not.

- **Nothing checks Prettier in CI.** `cargo fmt` is checked; its TypeScript
  counterpart is not. Two files on `main` are already unformatted, so adding the
  step goes red on the first run and the formatting commit has to come with it.

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
reader's *option* rather than the foundation, which means the canonical store
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

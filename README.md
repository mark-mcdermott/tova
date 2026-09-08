# Tova

A calm, local-first desktop writing application. Markdown notes, lightweight
blogging, and a hybrid of work and personal writing, with quick publishing and
fast export.

Tova is a rebuild of [Xin](https://github.com/mark-mcdermott/xin) with cleaner
architecture, better editor behaviour, and fewer edge cases.

## Running it

```
cd tova
pnpm install
pnpm run dev
```

`pnpm run check`, `pnpm run test` and `pnpm run build` are the verification
loop; all three stay green.

## Where things are

| Path | What |
|------|------|
| `tova/` | The application |
| `docs/SPEC.md` | What to build |
| `docs/BUILD_PHASES.md` | The order to build it in |
| `tova/PROGRESS.md` | Current state, architecture notes, carried-forward items |
| `branding/` | Mockups, logo, background originals |

## Stack

Electron 42 · React 19 · TypeScript 6 (strict) · CodeMirror 6 · electron-vite 5
· Zustand · Vitest 4 · pnpm. Styling is hand-written CSS driven by design
tokens — no utility framework and no component library.

## Building

```bash
pnpm install
pnpm run dev        # run it
pnpm run package    # signed .dmg for arm64 and x64, into release/
```

`pnpm run icon` regenerates `build/icon.png` from `tools/icon.html` — Electron
renders it, so the icon is drawn by the same engine that draws the app rather
than by adding an image toolchain.

Packaging signs automatically from whatever Developer ID is in the keychain.
Notarization is configured but not run: it needs an Apple ID, an
app-specific password and a team ID in the environment, and until it has run
Gatekeeper will refuse the app on any machine that did not build it.

## Possible future roadmap

- **Grammar checking.** Needs a new dependency, and the credible ones are large
  and noisy. Spelling is Chromium's and free; grammar is a real decision.
- **Several vaults.** One vault, at `~/Documents/Tova`. The Settings tab shows
  and reveals it; switching between vaults is unbuilt.
- **A tooltips toggle**, from the original settings spec.
- **Adding a background image from Settings.** The picker shows what is bundled;
  a dashed tile with a plus, beside the thumbnails, would copy a chosen file
  into the app's data directory and list it with the rest.
- **Paging the vault's snapshot list.** It grows to whatever `backupLimit`
  allows — 200 at the top of the range — and today renders every row.
- **A licensed script face.** `Alagambe` is bundled for note titles and is
  proprietary, which is why this repository is private. Replacing it is the
  first step to making it public — see `tova/PROGRESS.md`.
- **Folder reordering.** Every other drag rule works; this one needs somewhere
  to persist a manual order, and raises whether editing a note should still
  float it to the top. Worth a decision rather than a guess.

Deliberately deferred. Each is understood and scoped, just not next.

**Theme picker and dark theme.** The palette is light-only today. A second set
of tokens plus a light/dark/system picker. The measurements in `PROGRESS.md`
record what the dark treatment needs to stay legible over a photograph.

**Focus mode.** Hide the sidebar and centre the writing column, on
`Cmd+Shift+F` and from the View menu.

**Full-text search.** The sidebar's field searches titles and tags, which is
everything the renderer already holds. Searching bodies means reading every
file in the vault, so it wants an index in main rather than a filter in the
renderer.

**Folder reordering by drag.** Every other drag rule works. Reordering needs
somewhere to persist a manual order, which collides with sorting notes by
recency — a product decision rather than an implementation detail.

**Syntax highlighting inside code blocks.** Needs `@codemirror/language-data`,
which carries real bundle cost.

**Export to PDF.** The editor's menu exports Markdown today. A PDF needs a
Markdown-to-HTML renderer, which Tova does not have.

**A readable measure for prose.** The writing area spans the panel so its
insets match the title's, which means long lines on a wide window. Capping and
centring the column would restore it.

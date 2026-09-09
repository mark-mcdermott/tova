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

- **Clearing the font history.** Every face the app ships is now OFL, but
  Alagambe and four Acumin weights remain in past commits, and a clone gets
  them. Publishing means dealing with the history, not just the tree — see
  `tova/PROGRESS.md`.

Focus mode, folder reordering and a theme picker were dropped rather than
deferred; light and dark are built, and the rest are not planned.

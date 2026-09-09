# Tova

A calm, local-first desktop writing application. Markdown notes, lightweight
blogging, and a hybrid of work and personal writing, with quick publishing and
fast export.

Tova is a rebuild of [Xin](https://github.com/mark-mcdermott/xin) with cleaner
architecture, better editor behaviour, and fewer edge cases.

## Running it

```bash
pnpm install
pnpm run dev
```

`pnpm run check`, `pnpm run test` and `pnpm run build` are the verification
loop; all three stay green.

## Where things are

| Path | What |
|------|------|
| `src/main/` | Filesystem, IPC, publishing — everything privileged |
| `src/renderer/` | The interface, and the CodeMirror editor |
| `src/shared/` | Types and pure logic both sides use |
| `docs/SPEC.md` | What to build, and what was deliberately cut |
| `docs/BUILD_PHASES.md` | The order it was built in |
| `PROGRESS.md` | Current state, architecture notes, carried-forward items |

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

`pnpm run icon` regenerates `build/icon.png` from `tools/icon-source.png`,
placing it as the 824px body on the 1024px canvas macOS expects. Electron does
the rasterising, so the icon needs no image toolchain of its own.

Packaging signs automatically from whatever Developer ID is in the keychain.
Notarization is configured but not run: it needs an Apple ID, an
app-specific password and a team ID in the environment, and until it has run
Gatekeeper will refuse the app on any machine that did not build it.

## Possible future roadmap

Nothing outstanding. Every face the app ships is under the SIL Open Font
Licence, and the repository carries no proprietary artwork.

Focus mode, folder reordering and a theme picker were dropped rather than
deferred; light and dark are built, and the rest are not planned.

# Tova — Progress

## Current state

| Phase | Status |
|-------|--------|
| 0 — Project scaffold | Complete |
| 1 — Editor core | Complete |
| 2 — File system & note management | Complete |
| 3 — Backups & data safety | Complete |
| 4 — Daily notes | Complete |
| 5 — Navigation & sidebar polish | 6 of 7 — drag-and-drop remains |
| 6 — Glassmorphic UI | Next, partly blocked on assets |

288 tests. `pnpm run check`, `pnpm run test` and `pnpm run build` are green.

Package manager is **pnpm**, pinned by the `packageManager` field.
`.npmrc` sets `node-linker=hoisted`, which electron-builder needs in Phase 13.

## How it fits together

**Main process** owns the filesystem. `vault.ts` is the single choke point that
turns renderer strings into paths and refuses anything resolving outside the
vault. `notes.ts` holds note operations, `backup.ts` snapshots and versions,
`daily.ts` handles today's note and the midnight timer. Everything reaches the
renderer through typed IPC in `ipc/`, which validates shapes before they touch
disk.

**Vault layout** — `~/Documents/Tova/`

```
notes/          loose notes and one level of folders
daily/          YYYY-MM-DD.md
trash/          soft-deleted notes, flat
.versions/      per-note history, invisible to the note listing
```

Backups live in `~/Documents/Tova Backups/` — beside the vault, never inside it.

**Front matter** carries `title`, `section`, `folder` and `deletedAt`. For a
trashed note, `section` and `folder` record where it came from, which is how
restore returns it to the right folder.

**Today's daily note** is guaranteed by three paths, not one: an explicit check
at launch, a midnight timer, and a re-check on system wake and window focus. A
timeout armed before the machine sleeps cannot be trusted to fire, so the timer
is re-armed from the current clock each time rather than relied upon. The check
runs once per date, so a note deliberately trashed does not spring back.

**Renderer** is a zustand store plus components. The editor reloads its document
on `openSeq`, which only deliberate opens bump — a save that renames the file
changes the note id without yanking the cursor.

**Menus** portal to `document.body`. The glass panels use `backdrop-filter`,
which makes them the containing block for `position: fixed` descendants; a menu
nested inside one is positioned against the panel rather than the viewport, and
focusing it scrolls the panel's clipped box sideways.

## Phase 6 needs assets that do not exist yet

None of these are in the repo, and three of them are purchases or photographs:

- `bg-dark.jpg` and `bg-light.jpg` — the full-bleed background
- **Alagambe** — the script face for note titles
- **Acumin Pro Light** — the wordmark

Until they land, the background is a layered CSS gradient and the title falls
back to Snell Roundhand.

**The mockup is light; the app is currently dark.** Phase 6's goal is "looks
exactly like the mockup", so the light treatment is the primary target rather
than a variant. The mockup also predates the spec — it shows the Ideas, Journal
and Archive sections the spec explicitly cut — so follow the spec for structure
and the mockup for look.

## Carried forward

- **No syntax highlighting inside code blocks.** Needs `@codemirror/language-data`
  — a new dependency with real bundle cost.
- **Export .pdf is not implemented.** The `...` menu offers Export .md only.
  A PDF needs a markdown-to-HTML renderer, which Tova does not have.
- **Drag-and-drop is not done.** The last item of Phase 5. Folder *reordering*
  needs somewhere to persist a manual order; folders currently sort alphabetically.
- **Light theme is untokenised.** The token block is dark-only; Phase 6 adds the
  picker and the second palette.
- **Backup status has no UI.** The IPC exists; the Settings panel is Phase 12.
- **No Playwright.** The lifecycle tests the build plan wanted from it run in
  Vitest against a real temp filesystem instead, which needs no extra dependency.
- `TUTORIAL.md` is a frozen historical record and still shows `npm` commands.
- Blockquotes, tables and the Cmd+K link popup are specified but belong to later
  phases.

## To resume

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/BUILD_PHASES.md`, and this file.

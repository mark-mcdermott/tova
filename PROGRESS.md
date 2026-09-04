# Tova — Progress

## Current state

| Phase | Status |
|-------|--------|
| 0 — Project scaffold | Complete |
| 1 — Editor core | Complete |
| 2 — File system & note management | Complete |
| 3 — Backups & data safety | Complete |
| 4 — Daily notes | Complete |
| 5 — Navigation & sidebar polish | Next |

196 tests. `npm run check`, `npm run test` and `npm run build` are green.

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

## Carried forward

- **Alagambe script font is not bundled.** The note title falls back to Snell
  Roundhand. Drop the real face into `assets/` and update `--font-script`.
- **No syntax highlighting inside code blocks.** Needs `@codemirror/language-data`
  — a new dependency with real bundle cost.
- **No background photo.** Phase 6 bundles `bg-dark.jpg` / `bg-light.jpg`; a
  layered gradient stands in for now.
- **Light theme is untokenised.** The token block is dark-only; Phase 6 adds the
  picker and the second palette.
- **Backup status has no UI.** The IPC exists; the Settings panel is Phase 12.
- **No Playwright.** The lifecycle tests the build plan wanted from it run in
  Vitest against a real temp filesystem instead, which needs no extra dependency.
- Blockquotes, tables and the Cmd+K link popup are specified but belong to later
  phases.

## To resume

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/BUILD_PHASES.md`, and this file.

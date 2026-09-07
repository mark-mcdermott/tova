# Tova — Progress

## Current state

| Phase | Status |
|-------|--------|
| 0 — Project scaffold | Complete |
| 1 — Editor core | Complete |
| 2 — File system & note management | Complete |
| 3 — Backups & data safety | Complete |
| 4 — Daily notes | Complete |
| 5 — Navigation & sidebar polish | Complete, bar folder reordering (see below) |
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

## Phase 6 assets

**Fonts are in.** `Alagambe` (note titles) and `Acumin Pro` (wordmark) are
bundled under `src/renderer/assets/fonts/` and wired through `--font-script`
and `--font-wordmark`.

Both are proprietary — Acumin Pro is Adobe's, all rights reserved — which is
why this repo is private. It cannot be made public again without removing them.

Only Acumin Pro **Regular** was available; the mockup uses **Light**. The
wordmark leans on tighter tracking and a smaller size to compensate.

**One background is bundled** — `lake-sunset.jpg`, the backdrop extracted from
the mockup. It is the only image measured with the luminance split the layout
relies on. `backgrounds.ts` still globs the folder and picks one per launch, so
dropping a second image back in restores the rotation with no code change. The
four Unsplash photographs were removed; the originals remain in
`branding/backgrounds/`.

**Panel tint, not the photo, carries contrast.** Measured across the four
photos, text on the bare photo bottoms out at **1.3:1** — a full-height sidebar
crosses bright sky and dark land in every one of them, so no fixed text colour
works. Light text on the dark panel needs **at least 54% opacity** to hold WCAG
AA; the panels sit at 62%, worst case 5.8:1. Treat 54% as a floor when tuning.

**The app is a light theme.** Dark text on a pale scrim, as the mockup has it.

**The editor is untouched; the sidebar is not.** Fitting the mockup's pixels
against its own backdrop gives `result = 1.00 x backdrop + 0` for the editor and
`result = 0.72 x backdrop + 42` for the sidebar. The second solves to a 28%
overlay of `#908d9d`, a mid grey-lavender.

Its direction is the reverse of how it reads: it *lifts* the shadows rather than
deepening them — a sample at (57,61,67) comes out (84,91,102), while a bright
one barely moves. The headlands behind the sidebar go hazy, not dark, and look
darker only because the editor beside them is untouched and vivid.

It also compresses the range, which moves white sidebar text from 2.1-11.8:1 on
the bare photograph to 2.4-8.1:1 under the overlay. Legibility rides entirely on text colour: white in
the sidebar and the breadcrumb row, dark ink for the prose.

**This is a deliberate trade against contrast, chosen with the numbers known.**
Sampled in 40px cells (region averages hid the extremes), white sidebar text
runs from 11.8:1 over the dark headland down to **2.1:1** where the photograph
is brightest, and dark prose bottoms out near **1.7:1** in the same way. The
mockup has the same property; it works because its text sits over the bright
water, and Tova's scrolls anywhere.

The toolbar ink is white, `#fffeff`, matching the sidebar rather than the
mockup's slate. It sits over the darker water at the foot of the image, so this
is the strongest of the three options measured: **2.4:1 to 4.3:1**, against
1.3-2.4:1 for the mockup's slate and 2.2-4.0:1 for the dark ink before it.

If a future background is less forgiving, the lever is `--glass-bg`: a white
scrim around 48% restored better than 5:1 for dark text, and a 40% dark scrim
carries white text at 4.7:1. Both are one token.

White is set on `.sidebar` and `.editor-nav` rather than globally, so the prose
below keeps its dark ink on the same untinted backdrop.

**Superseded — the old dark treatment used `backdrop-filter: brightness()`.** A flat
tint heavy enough to be safe flattened the photograph to mud. Scaling the
backdrop instead keeps its colour and texture: `brightness(0.45)` with a 6%
tint measures 5.8:1 — identical to the 62% wash it replaced, at a tenth of the
opacity. `--glass-dim` above roughly 0.5 drops the brightest photograph below AA.

Secondary text had to be lifted to match. Tuned against the old opaque wash, the
muted greys fell to 1.7:1 once the photograph showed through. They are now set
against the brightest bundled photograph: 5.3:1 secondary, 4.6:1 muted, 3.1:1
for faint placeholder text.

**Sidebar and editor share one pane of glass**, divided by a hairline, rather
than floating as separate cards. The sidebar adds a 20% scrim over the shared
glass — it carries most of the small secondary text, so its backdrop needs to be
the more predictable of the two.

**The mockup is light; the app is currently dark.** Phase 6's goal is "looks
exactly like the mockup", so the light treatment is the primary target rather
than a variant. The mockup also predates the spec — it shows the Ideas, Journal
and Archive sections the spec explicitly cut — so follow the spec for structure
and the mockup for look.

## Carried forward

- **An empty section cannot be opened**, so the "+ New note" row inside it is
  out of reach. Notes still get there: the compose control creates in Notes, and
  the editor's Move menu files a note into any of the flat sections. Only the
  in-section shortcut is unreachable while the section is empty.

- **Theme picker, dark theme, focus mode and search are deferred**, along with
  folder reordering, code highlighting and PDF export. See the roadmap in
  `README.md` for what each needs.

- **Prose no longer wraps at a readable measure.** The writing area now spans
  the panel so its insets match the title's, which meant dropping the 68ch cap
  on `.cm-content`. On a 1900px window that wraps around 105 characters, above
  the 45-90 usually considered comfortable, and it grows with the window.
  `--measure` still exists and still caps the title.

- **The sidebar is narrower than the mockup's, proportionally.** Ours is 240px
  of a 1280px window (18.8%); the mockup's is 22.2%, which would be about 284px
  here. With the wider gutters and larger icons now in place, a folder named
  `correspondence` truncates. Widening to the mockup's proportion would fix it.

- **Sidebar sections start collapsed**, Tags aside, so the sidebar opens as the
  flat list the mockup shows. Nothing is persisted, so this is every launch.

- **Sidebar collapse has no visible control.** The caret was removed to match
  the mockup, which puts an avatar there instead. `Cmd+\` and the reveal tab
  still drive it, and the store, styles and tests are intact — restoring the
  control is putting a button back, not rebuilding the feature.

- **No syntax highlighting inside code blocks.** Needs `@codemirror/language-data`
  — a new dependency with real bundle cost.
- **Export .pdf is not implemented.** The `...` menu offers Export .md only.
  A PDF needs a markdown-to-HTML renderer, which Tova does not have.
- **Folder reordering is not implemented.** Every drag rule in the spec works —
  note into a folder, note out to the root, note to Trash with a confirmation,
  Daily refusing everything — except "drag folder → reorder within Notes". That
  one needs somewhere to persist a manual order, and notes currently sort by
  recency with folders alphabetical. Adding an explicit order also raises the
  question of whether editing a note should still float it to the top. Worth a
  decision rather than a guess.
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

# Tova — Build Phases

## Phase 0 — Project Scaffold

**Goal:** Electron + Vite + React + TypeScript dev environment, blank window.

- [x] `package.json`: `dev`, `build`, `check` scripts; core deps
- [x] `tsconfig.json` (strict)
- [x] `vite.config.ts`
- [x] `electron-builder.yml`
- [x] `src/main/index.ts`, `src/preload/index.ts` (contextBridge stub)
- [x] `src/renderer/` (blank React app + Tailwind)
- [x] ESLint + Prettier (`semi: false`, `trailingComma: "none"`)
- [x] Vitest configured
- [x] TUTORIAL.md started

**Deliverable:** `pnpm run dev` → blank window. `pnpm run build` passes. `pnpm run test` runs (0 tests, no failures).

---

## Phase 1 — Editor Core (Platform Baseline)

**Goal:** Title + CodeMirror live WYSIWYG. Every platform shortcut works.

- [x] Title `<input>` (Alagambe script font) above CodeMirror
- [x] CodeMirror 6 + markdown language extension
- [x] Live preview decorations (bold, italic, headings, inline code, code blocks, tag pills, links)
- [x] Calm glassmorphic editor CSS
- [x] Auto-save to hardcoded temp file (IPC write proved)
- [x] Word count + bottom formatting toolbar (buttons insert markdown)
- [x] **Manual verification checklist**: Cmd+Z, Cmd+C/V/X/A, cursor click, code blocks, macOS text shortcuts, Tab in title → body, Enter in title → body

Write Vitest tests: tag extraction utility, front-matter parser, date formatter.

**Deliverable:** Live WYSIWYG markdown. Title beautiful. All shortcuts work. First tests green.

---

## Phase 2 — File System & Note Management

**Goal:** Real notes on disk. Sections. Trash.

- [x] IPC: `note:list`, `note:read`, `note:write`, `note:create`, `note:rename`, `note:move`, `note:delete` (→ Trash), `note:restore`, `note:permanentDelete`
- [x] Notes as `.md` with YAML front-matter (`section:`, `folder:`)
- [x] Sections: Notes, Daily, Trash
- [x] 1-level folder support under Notes
- [x] Sidebar: FOLDERS + TAGS collapsible sections, accordion folder tree
- [x] Click note → opens. New note → creates. Delete → Trash.
- [x] Rename: title → filename sync

Write Vitest tests: note list sorting, Trash/restore state transitions.
Write Playwright test: create note → file on disk; delete → Trash.

**Deliverable:** Full note lifecycle on real filesystem. Trash works.

---

## Phase 3 — Backups & Data Safety

**Goal:** No data loss possible.

- [x] IPC: `backup:run`, `backup:list`, `backup:restore`
- [x] Auto-backup on launch + hourly
- [x] Keep last 30 (configurable)
- [x] Version history per note (last 10)
- [x] Empty vault detection on launch → warn + restore option
- [x] Backup status in Settings

Write Vitest tests: backup naming, version count enforcement.
Write Playwright test: backup folder exists after launch.

**Deliverable:** Data loss cannot happen silently.

---

## Phase 4 — Daily Notes

**Goal:** Today's note on launch. Midnight creation. Blank past notes auto-cleaned.

- [x] Auto-create + auto-open today's `YYYY-MM-DD.md` on launch
- [x] Midnight (00:00:01 local) → silently create next day's file (no editor load)
- [x] Right-click Daily → context menu: "Open Today's Note" (only option)
- [x] Auto-delete blank past daily notes on launch (silently)

Write Vitest tests: blank note detection, midnight scheduler.
Write Playwright test: blank past daily note gone after launch.

**Deliverable:** Daily notes work correctly. No accumulation of blank past notes. Midnight creation reliable.

---

## Phase 5 — Navigation & Sidebar Polish

**Goal:** Back/forward, breadcrumbs, context menus, drag-and-drop.

- [x] Navigation history stack (Zustand)
- [x] Back/forward arrows in editor header
- [x] Breadcrumbs (1–3 levels, clickable)
- [x] Right-click context menus (note, section, folder, Daily)
- [x] `...` editor header menu (context-sensitive per note type)
- [x] Drag-and-drop note/folder reorder and move
- [x] Sidebar collapse (chevron + Cmd+\)

Write Vitest tests: navigation history push/pop/forward.

**Deliverable:** Full navigation. Context menus work.

---

## Phase 6 — Glassmorphic UI

**Goal:** Looks exactly like the mockup.

- [x] Full-bleed background photo — one light photograph; the dark variant went with the dark theme
- [x] Sidebar and editor panels — blur and tint were removed by choice; see PROGRESS.md
- [x] One shared popup/menu component (context menus, note actions, blog selector, spelling)
- [x] CSS variable design token system. Accent: Tova purple. Zero hot pink.
- [x] Alagambe script font for note title
- [x] Acumin Pro for wordmark — only Regular is licensed, so tracking and size carry the weight
- [x] Monospace body font in editor
- [ ] Dark / light / system theme — deferred to the roadmap
- [x] Focus mode — dropped, not deferred: Tova is one light view over a photograph
- [x] Window state persistence
- [x] macOS title bar / traffic lights (hiddenInset, with drag regions declared)
- [x] User avatar + display name at sidebar bottom (click → Settings)
- [x] Tooltips on all icons
- [ ] Search icon in sidebar header — with search, deferred to the roadmap
- [x] Images: drag-in/paste → vault assets → CM6 inline render

**Deliverable:** App looks like the mockup. Portfolio-worthy.

---

## Phase 7 — Search & Tags

**Goal:** Find any note by content or tag.

- [ ] Search: sidebar icon → expanded input + RECENT MATCHES + "View all results →"
- [ ] Live full-text filter across Notes + Daily + Posts
- [ ] Esc/✕ closes search
- [x] Tag counts aggregated in TAGS sidebar section
- [ ] Click tag in sidebar → scroll to first instance in open note (or filter if no note open)

**Deliverable:** Navigate by content or tag.

---

## Phase 8 — Spellcheck & Grammar

**Goal:** Writing quality feedback.

- [x] Spell check — Chromium's own, not a CM6 decoration layer; right-click correction popup
- [x] Timing: correct by construction — Chromium only marks a finished word
- [x] Personal dictionary (Add to dictionary in popup; managed under General)
- [ ] Grammar check — deferred to the roadmap: needs a new dependency, and the good ones are heavy
- [ ] Grammar toggle in Settings — with the check above

**Deliverable:** Editor feels like a real writing tool. Timing correct (fixed Xin bug).

---

## Phase 9 — Blog Authoring & Publishing

**Goal:** Write and publish inline. Rocket → progress → checkmark.

- [x] `@` → blog selector popup → front-matter block inserted inline
- [x] Front-matter lines rendered italic + subdued color (no box/background)
- [x] `@blogname post 🚀` — rocket inline at end of line
- [x] `---` on its own line → thin `<hr>` separator
- [x] Click 🚀 → publish begins, non-blocking progress bar top-right
- [x] Progress bar: optimistic timing + CFP/Vercel API polling every 3s
- [x] Success → ✓. Failure → error message. Clicking ✓ republishes directly.
- [x] `lastPublishedFilename` tracked; rename = delete old + publish new

Write Vitest tests: `@` syntax parser, YAML↔`@` round-trip, filename generation, publish state machine.
Write Playwright test: publish request sent, progress bar appears.

**Deliverable:** Full inline authoring and publish flow.

---

## Phase 10 — Blog Sync & POSTS Sidebar

**Goal:** Bidirectional sync. Blog posts in FOLDERS sidebar.

- [x] Blog folder entry in FOLDERS sidebar (user-defined label, fallback: blog name truncated)
- [x] Fetch all posts from GitHub repo → local `.md` files (first sync: progress + batched)
- [x] Edit synced post locally → republish (overwrite remote)
- [x] Delete local → prompt to delete remote
- [x] Sync status + ↻ button in Settings Blogs tab
- [x] Conflict handling (local + remote both changed → diff prompt)
- [x] Multiple blogs supported

**Deliverable:** Sync. Edit. Republish. Delete. All work across sessions.

---

## Phase 11 — Blog Configuration (Settings — Blogs Tab)

**Goal:** Full blog CRUD in Settings.

- [x] Blogs tab: list + sync/edit/delete per blog
- [x] Add/Edit blog form (two-column layout): Blog Name, Sidebar Label, GitHub, Cloudflare Pages (optional), Vercel (optional), Content section
- [x] Delete blog → confirm + option to send local synced posts to Trash

**Deliverable:** Self-contained blog management.

---

## Phase 12 — Full Settings Panel

**Goal:** All tabs complete. Docs accessible. Support channels in place.

- [x] Settings with tabs: Profile | Appearance | Vault | Blogs | General | Docs
- [x] Profile: avatar upload + display name
- [x] Appearance: background picker — the tooltips toggle is on the roadmap; a theme picker is not planned
- [ ] Vaults: the one vault is shown and revealed; several vaults is unbuilt
- [x] General: font size, tab size, backup config, personal dictionary — grammar with the check above
- [x] Docs tab: seven sections, read-only and searchable
- [x] Bug report — a GitHub issues link. Tipping and a feedback form need a destination Tova does not have

**Deliverable:** Fully configurable. App is self-explanatory.

---

## Phase 13 — Packaging

**Goal:** Installable `.dmg`.

- [x] electron-builder finalized
- [x] App icon — generated, not from `/branding/logo.png`; see PROGRESS.md
- [x] macOS `.dmg` (arm64 + x64, signed)
- [x] Code signing — automatic from the Developer ID in the keychain
- [ ] Notarization — needs Apple ID credentials; configured but not run

**Deliverable:** Installable app.

---

## Verification (after each phase)

- `pnpm run check` — TypeScript strict passes
- `pnpm run test` — fast suite green
- `pnpm run build` — builds without errors
- `pnpm run dev` — opens, phase features work manually
- Append section to `TUTORIAL.md`

# Tova — Specification

## Stack & Architecture

**Stack:** Electron + React 19 + TypeScript strict + CodeMirror 6 + Zustand + Tailwind + Vite

**Architecture principles:**
- Zero inline styles — Electron is Chromium, same rules as web. All styling in Tailwind classes or `.css` files with CSS variables.
- Small functions, clear module boundaries
- One shared popup/menu component — not duplicated per feature
- `npm run check` and `npm run build` always green

**Code style:** ESLint + Prettier. `semi: false`, `trailingComma: "none"`.

---

## Design System

**Fonts:**
- Wordmark ("Tova"): Acumin Pro Light, tight kerning, smaller font size
- Note title: Alagambe script font, large. Wraps to multiple lines (tall multi-line titles look like book covers). Numbers in Alagambe are acceptable — may revisit later.
- Editor body: monospace font
- Sidebar: system sans-serif

**Colors:**
- Accent: Tova purple (single CSS variable). No hot pink anywhere — that was a Xin holdover.
- Tag pills: see Tag spec below

**Glassmorphic theme:**
- Full-bleed background photo: bundled dark (warm sunset) + light (bright/warm variant). Custom background option in Settings.
- Panels: `backdrop-filter: blur()` + low-opacity tint
- All popups, toasts, and context menus: **light frosted** style — white/light frosted glass background, dark text, rounded corners, subtle shadow. Confirmed from `...` menu mockup and Xin publish toast screenshots. NOT dark rounded.
- CSS variable design token system

**Form design system (all Settings forms):**
Two-column layout. Left: bold label title (large — carries readability against glassmorphic background) + smaller helper/detail text below. Right: large input field. Confirmed from avatar upload mockup — apply to ALL forms including Add Blog, Add Vault, etc.

---

## Sidebar

```
[Tova wordmark]   [✏ new note]
                  [Q search]

▶ FOLDERS
    My Blog  12          ← user-defined label per blog
    Notes    24
      ▾ ideas    6
          project river
          ai alignment
          ...
      ▾ drafts   5
          ...
      loose-note.md
    Daily    6
    Trash    2

▶ TAGS
    # thoughts   7
    # writing    6
    + New tag

[avatar] Alex   [gear]
```

- **One scrollable area** (`overflow-y: auto`) — no fixed-height splits
- **FOLDERS** and **TAGS**: collapsible section headers (`▶`/`▾` arrow on left)
- **Folders start collapsed** on app launch — no state persisted across sessions
- **All folder icons identical** — consistent folder icon under Notes
- **Note and tag names display lowercase** in sidebar — visual convention only. Actual title shows correct case in editor and breadcrumb. Intentional, not a bug.
- **Blog posts in FOLDERS** as a peer to Notes/Daily/Trash. User-defined sidebar label per blog (Settings). Fallback: blog name, CSS `text-overflow: ellipsis`.
- **Sidebar collapsible:** hover chevron at edge + Cmd+\
- **Pencil icon**: top right of sidebar header → new note
- **Search icon**: stacked below pencil (see Search section)

---

## Search

**Search icon** in sidebar header, below pencil.

Opacity states:
- Idle: 0.78–0.82
- Hover: 0.9 + slightly brighter stroke + subtle background brightening (NOT full-opacity)
- Active/open: 1.0 + subtle filled glass background

**Expanded state** (click or Cmd+F):
- Search icon → ✕. Wordmark stays.
- "Search notes…" glassmorphic input at top
- "RECENT MATCHES": note name (bold) + section/tag label below. Nested: path shown (`drafts/river-notes`).
- "View all results →" link
- Normal sidebar (FOLDERS, TAGS) pushed below, still scrollable
- Live filter as user types
- Esc/✕ closes, restores sidebar
- Full-text search: Notes + Daily + Posts

---

## Editor

### Title
- Separate `<input>` above CodeMirror — NOT inside CM (avoids Xin cursor/enter bugs)
- Alagambe script font, large, wraps to multiple lines
- Tab in title → focus to body. Enter in title → focus to body.
- Auto-save debounced ~500ms

### CodeMirror Body
- Auto-save debounced ~500ms
- Word count in bottom toolbar
- Monospace font

### Bottom Toolbar
| Button | Shortcut |
|--------|----------|
| T (plain) | Cmd+Shift+0 |
| H₁ | Cmd+Shift+1 |
| H₂ | Cmd+Shift+2 |
| B Bold | Cmd+B |
| I Italic | Cmd+I |
| / Strikethrough | Cmd+Shift+X |
| <> Inline code | Cmd+E |
| </> Code block | Cmd+Shift+E |
| ≡ List | Cmd+Shift+L |

All buttons show shortcut in tooltip on hover.

### Platform Baseline (all broken in Xin — must work perfectly)
- Cmd+Z / Cmd+Shift+Z undo/redo
- Cmd+C / Cmd+V / Cmd+X copy/paste in and out of editor
- Cmd+A select all
- Copy/paste from/to external apps
- Tab key: soft tab (2 spaces default, configurable)
- Cursor always lands where clicked
- Fenced code blocks and inline backticks render correctly
- All standard macOS text shortcuts (Cmd+Left/Right, Option+Left/Right, etc.)

### Focus Mode
Hide sidebar, center column. Cmd+Shift+F + View menu.

---

## Live WYSIWYG Markdown

**Implementation model:** CM6 `ViewPlugin` + `DecorationSet`. The lezer-markdown parser runs continuously. Decorations apply only to valid, complete constructs. Incomplete constructs fall back to plain visible text. Recomputes on every editor state change.

**Core contract:** A construct has a character range (first char to last, including all syntax markers). `cursor >= constructStart && cursor <= constructEnd` → show raw syntax. Outside → hide syntax, show rendered. No `atomicRanges`. No cursor teleporting.

### Construct-by-construct behavior

**Bold (`**text**`):**
- Incomplete (`**` no close) → plain visible text
- Complete, cursor outside → bold, `**` hidden
- Cursor inside → `**` visible AND text still bold
- Delete marker → immediately breaks to plain

**Italic (`*text*`):** identical pattern with single `*`

**Inline code (`` `code` ``):**
- Incomplete → plain visible backtick
- Complete, cursor outside → monospace box, backticks hidden
- Cursor inside → backticks visible, still monospace
- Delete marker → breaks to plain

**Code blocks (triple backtick fences):**
- Only hide fences when BOTH fences are valid ` ``` `. One broken → show all as plain.
- Complete, cursor outside block → fences hidden, content in styled dark box
- Cursor on fence line → that fence visible, rest styled
- Cursor inside content → fences hidden
- Delete one backtick from fence → entire block becomes plain
- Content must be on line AFTER fence (CommonMark). Fence line = language identifier.
- Smart Enter: type ` ``` ` + Enter → auto-insert closing ` ``` ` two lines below, cursor between fences
- Language identifiers: `js`, `ts`, `python`, `css`, `html`, `bash`, `json`, `markdown`, `ruby`, `go`, `rust`. Astro → falls back to HTML highlighter (known limitation).
- Syntax highlighting via CM6 `@codemirror/lang-markdown` `codeLanguages` option

**Code block margins — must be correct in all contexts:**
- Standard: margin-top, margin-bottom, left padding, monospace font, full-width background box
- At note start: no extra top gap
- Adjacent to another code block: consistent gap
- After list item: consistent gap
- After heading: consistent gap
- (These were consistently wrong in Xin — test all combinations)

**Links (`[text](url)`):**
- Incomplete → plain visible text
- Complete, cursor outside → "text" underlined + small ↗ icon appended, `[`, `](url)` hidden
- Cursor inside → full `[text](url)` raw syntax visible, icon hidden
- Links are NOT bold by default. Bold+link only when user writes `**[text](url)**`.

**Headings (`# text`):**
- Cursor on line → `#` dimmed, text at H1 weight
- Cursor off line → `#` hides, text stays large/bold
- Cursor returns → `#` reappears

**Blockquotes (`>`):**
- Cursor outside → `>` prefixes hidden, content in styled blockquote box (left border, tinted bg)
- Cursor inside → `>` prefixes visible
- Multiple `> ` lines = ONE blockquote (soft breaks join)
- Enter on non-empty `>` line → new `>` line
- Enter on empty `>` line → exit blockquote
- Nested (`>>`, `>>>`) → each level additional left border/indent

**Markdown tables (GFM):**
- Via `@codemirror/lang-markdown` `extensions: [Table]`
- Cursor outside → styled rendered table
- Cursor inside → raw pipe syntax visible
- Tab → next cell. Shift+Tab → prev cell. Enter on last cell → new row.

**Enter / Shift+Enter:**
| Key | File content | Rendered output |
|-----|-------------|-----------------|
| Enter | `\n` | Soft break → same paragraph |
| Enter+Enter | `\n\n` | New paragraph |
| Shift+Enter | `\\\n` | Hard line break (`<br>`) |

**Lists:**
- `- text` / `* text` → unordered. `1. text` → ordered (auto-continues on Enter)
- Enter on non-empty item → new item at same level
- Enter on empty item → exit list, normal paragraph
- Backspace at start of item → same as Enter on empty
- Tab → indent (nested). Shift+Tab → outdent.
- Shift+Enter → soft return within item (no new bullet)
- Delete at end of item → merges next line
- Ordered: auto-renumbers on delete

### Tags

**Detection rule:** Line contains ONLY `#tags` (and whitespace) → top-zone style. Tag embedded in prose line → body style.

**Top-zone tags** (own line):
- Light semi-transparent purple pill, purple `#` prefix, purple tag text
- NO cursor state change — pill always visible
- Delete `#` → immediately plain text
- Multiple tags on one line → multiple separate light pills

**Body tags** (inline in prose):
- Cursor off → solid purple pill, white text, `#` hidden
- Cursor on → pill dissolves, raw `#tagname` in accent purple
- Delete `#` → immediately plain text

Top-zone style can appear anywhere in a note (after `---`, between paragraphs — wherever a tag gets its own line).

### Link Creation Shortcuts
- Highlight text + Cmd+K → light frosted inline popup appears near selection, "Paste link" placeholder. Type/paste URL + Enter → inserts `[text](url)`. Esc cancels.
- Highlight text + Cmd+V with URL in clipboard → skips popup, inserts `[text](url)` immediately
- Cursor off link → underlined + ↗ icon
- Cursor on link → full raw syntax visible

### Text Selection
- Click-drag, Shift+arrow, double-click (word), triple-click (line), Cmd+A — all via CM6 built-in
- Selection + Cmd+B → wraps in `**...**`
- Selection + Cmd+I → wraps in `*...*`
- Selection + Cmd+E → wraps in `` `...` ``
- Selection + Cmd+K → link popup workflow

---

## Note Management

- Local filesystem: `.md` files with YAML front-matter (`section:`, `folder:`)
- Create in currently-selected context
- Delete → Trash (never immediate permanent delete)
- Restore from Trash; permanently delete; empty Trash
- Rename: edit title `<input>` → filename updates on auto-save (no separate sidebar rename widget)
- Move via `...` menu or context menu

**`...` editor header menu** (dark rounded dropdown, context-sensitive):

Regular note:
- Rename *(pencil)*
- Move to… *(folder)*
- *(separator)*
- Export .md *(file)*
- Export .pdf *(file)*
- *(separator)*
- Delete → Trash *(red trash, red text)*

Synced blog post: Rename, Export .md, Republish, Remove from blog
Daily note: Export .md, Export .pdf, Delete → Trash (no Move)
Note with published `@` post (✓): adds Republish option

---

## Daily Notes

- **On app open:** always open today's daily note. No prompt.
- **File creation on app open:** create `YYYY-MM-DD.md` if not exists. Title = `M/D/YY` (e.g. `5/17/26`). Body blank.
- **Midnight (00:00:01 local):** silently create next day's file. Do NOT load it — just create so it appears at top of Daily. Fixes Xin bug where file didn't exist until restart.
- **Left-click Daily:** expands with today's note first (most recent at top)
- **Right-click Daily:** context menu. "Open Today's Note" is the only option.
- **Auto-cleanup:** on launch, scan Daily for past dates with no content beyond the auto-generated title → silently delete. Today's note never auto-deleted.

---

## Drag & Drop (Sidebar)

- Drag note → drop onto folder = move
- Drag note → drop onto Notes root = remove from folder
- Drag folder → reorder within Notes
- Drop onto Trash = delete to Trash (confirm)
- Drop onto Daily = disallowed
- Auto-save unsaved changes before move
- Drop on current location = no-op
- HTML5 native drag-and-drop (no library)

---

## Navigation History

- Zustand stack: `[section, folder?, noteId, scrollPos]`
- Back arrow in editor header (disabled at start)
- Forward arrow (appears after going back)
- Breadcrumb: Notes / Folder / Note title (up to 3 levels, each segment clickable)

---

## Tags (Sidebar)

- Aggregated in TAGS section with counts
- Note with `#hoobie` and `#regression` appears under BOTH tags
- Click tag (note list view) → filter to all notes with that tag
- Click tag (note open) → scroll to first instance in current note
- `+ New tag` → inserts `#tagname` at cursor in current note
- Tag names: `#word` no space after `#`. Multiple same-tag occurrences = 1 note (not N).

---

## Context Menus, Popups, Toasts & Modals

All components use the one shared popup/menu component. **Light frosted** style — white/light frosted glass background, dark text, rounded corners, subtle shadow.

**Toasts** (top-right, ✕ to close):
- ✓ green: "GitHub Connected — Verified {repo} and content path" (auto-dismiss ~3s)
- ✗ red: "GitHub Connection Failed — {error}" (auto-dismiss ~3s)
- ✓ green: "Cloudflare Connected" (auto-dismiss ~3s)
- ✗ red: "Cloudflare Connection Failed — {error}" (auto-dismiss ~3s)

**Publish progress toast** (top-right, stays until dismissed or success — confirmed from Xin screenshots):
- Card layout: title row ("Publishing…") + ✕ → thin progress bar below title → status message + elapsed seconds right-aligned
- Progress bar: accent purple/pink → fills left to right → turns **green** on success
- Status message: "Waiting for Cloudflare deployment to finish" (or Vercel equivalent)
- On success: title → "Published!", bar fills green, body → "Success! [post]" — "post" is clickable link to live URL
- On failure: title → "Publish Failed", bar stops, error detail shown

**Modals** (overlay, explicit dismiss):
- Delete Blog: "⚠ Delete Blog — Are you sure? (this has no effect on the live blog)" + Cancel + Delete (red)
- Permanently Delete Note: same pattern
- Empty Trash: same pattern

**Context menus:**
- Right-click file: Rename, Delete
- Right-click folder: New Note, New Folder, *(separator)*, Rename, Delete
- Right-click empty area: New Note, New Folder
- Right-click Daily: "Open Today's Note"

**`@` blog selector dropdown** (typed `@` on new line):
- Light frosted, one row per configured blog
- Blog name in Tova purple, "blog" label right-aligned in gray
- Filter as user types. Arrow keys + Enter to select.

**`@` frontmatter picker dropdown** (typed `@` inside a post):
- Light frosted, rows: date, published, slug, subtitle, tags, title — "frontmatter" label in Tova purple on right
- `date` selected by default. Typing filters. Enter inserts `@fieldname `.

**Spellcheck popup** (right-click squiggle only — never auto):
- No suggestions: `Add "word" to dictionary`
- Has suggestions: ranked corrections → *(sep)* → `Add "word" to dictionary` → *(sep)* → lower-confidence
- Squiggle shows after word finished (space/punct/line break + debounce)

**Cmd+K link popup:**
- Dark rounded, inline near selection, "Paste link" placeholder, single input
- Enter → insert `[text](url)`. Esc cancels.

---

## Blog Authoring — `@` Format

Tova uses `@` decorator syntax exclusively. No `---` YAML front-matter in the UI. Synced posts convert YAML→`@` on import and `@`→YAML on publish. Round-trip is lossless.

**`@` field spec:**
```
@markmcdermott.io post  🚀
@title Quick Git Notes
@subtitle Amending, Squashing & Diffing Cheatsheet
@date 2026-05-17
@tags git, tutorial
@slug quick-git-notes
@heroImage /images/git.jpg
```

**Field rules:**
- No quotes needed — value is everything after `@field `, trimmed
- `@title "My Title"` → strip outer quotes → `My Title`
- Apostrophes fine. Double quotes in value → YAML export wraps in single quotes
- `@date YYYY-MM-DD`. Accepts `YY-MM-DD` (normalized). Optional — defaults to today on publish.
- `@tags a, b, c` — comma separated, case preserved in input, lowercased on YAML export
- `@slug` optional — overrides auto-generated slug
- Unknown `@fields` → pass through as `fieldname: "value"` in YAML

**Post body:** extends from after front-matter lines to: (1) `---` end marker, (2) next `@blogname post` line, or (3) EOF. Multiple posts in one note work naturally.

**Front-matter rendering:**
- `@blogname post`, `@title`, `@subtitle`, `@date`, `@tags`, etc. → italic, subdued color. No box or background.
- 🚀 rendered inline at end of `@blogname post` line.
- `---` on its own line → thin `<hr>` across text column.

**Import conversion (Astro YAML → `@`):**
- `title: "X"` → `@title X` (strip quotes)
- `date: "YYYY-MM-DD"` → `@date YYYY-MM-DD`
- `tags: ["Git", "Tutorial"]` → `@tags Git, Tutorial`
- Other fields → `@fieldname value` (pass-through)

**Export conversion (`@` → Astro YAML on publish):**
- `@title X` → `title: "X"`
- `@date YYYY-MM-DD` → `date: "YYYY-MM-DD"`
- `@tags a, b` → `tags: ["a", "b"]` (lowercased)
- `@slug X` → `slug: X`
- Unknown `@field X` → `fieldname: "X"`

**Filename generation:** `YY-MM-DD-slugified-title.md`. Date prefix from `@date` (2-digit year). Slug from `@slug` or slugified `@title`. `lastPublishedFilename` tracked — rename = delete old remote + publish new.

**Publish flow:**
- Compute final filename (`YY-MM-DD-slug.md`) BEFORE the API call — never use the raw template string
- Click 🚀 → publish progress toast appears top-right (see toast spec above)
- Optimistic progress: ticks up based on rolling average of last 5 deploys per blog
- Poll CFP/Vercel deployments API every 3s
- **On success:** simultaneously — (1) toast → "Published!" green state, (2) 🚀 → green circle ✓ inline, (3) post file appears in blog folder in sidebar immediately with correct computed filename. No refresh needed — synchronous sidebar update on publish success. This is critical: editing a just-published post is a common workflow (fix typos, republish).
- Failure → toast shows error detail, bar stops, 🚀 stays as 🚀
- Timeout (elapsed > 2× average) → hold at ~98%, keep polling
- Click ✓ → back to 🚀 for republish

**Xin bugs to NOT reproduce:**
- `{slug}.md` literal appearing as filename — fix: interpolate filename before API call, never store the template
- Tab key stealing focus to 🚀 button — fix: set `tabIndex="-1"` on the rocket widget's DOM element so keyboard Tab never reaches it. Mouse-clickable only. Without this, Tab to indent a bullet list inside a post is broken.

---

## Blog Configuration

Fields per blog:
- **Blog Name** (required)
- **Sidebar Label** (optional) — custom sidebar folder label. Fallback: Blog Name, `text-overflow: ellipsis`.
- **GitHub:** Repository (username/repo)*, Branch*, Personal Access Token*, Content Path*
- **Cloudflare Pages** (optional): Account ID, Project Name, API Token
- **Vercel** (optional): Project ID, API Token
- **Content:** Live Post Path, Filename Template* (e.g. `{slug}.md` — `{slug}` = `@slug` value)

---

## Blog Sync (Bidirectional)

- Fetch all posts from GitHub repo → local `.md` files
- First sync: progress indicator, batch import
- Edit locally → republish (overwrites remote)
- Delete local → prompt to delete remote
- Sync status: "Last synced: N ago" + ↻ in Settings Blogs tab
- Conflict (both changed locally and remotely) → diff prompt
- Multiple blogs fully independent

---

## Backups & Data Safety

- Auto-backup on launch + hourly
- Keep last 30 backups (configurable) in dated folders
- Configurable backup directory (Time Machine–friendly)
- Version history per note: last 10 versions (configurable)
- Trash: soft-delete, never auto-emptied
- On launch: empty vault detected → warn + offer restore from backup

---

## Spellcheck & Grammar

**Spellcheck:**
- CM6 decoration layer (squiggly underline)
- Right-click squiggle → popup with corrections. Ranked suggestions + "Add to dictionary".
- Squiggle shows after word is "finished" (followed by space/punct/line break + debounce). Never mid-word.
- Personal dictionary persisted locally.

**Grammar check:**
- Distinct underline style from spellcheck
- Lightweight embedded JS library (no server)
- Right-click → explanation + suggestion popup
- Grammar check on/off toggle in Settings General tab

---

## Settings Panel

Settings opens in main content area. Sidebar stays visible. Tabs at top. Back arrow (←) returns to active note.

**Tabs: Profile | Appearance | Vaults | Blogs | General | Docs**

**Profile tab:**
- Avatar: circular, 512×512 recommended. Upload Image button + Remove button + click-to-change. Default = initials on color background. Stored locally.
- Display Name field.
- (No email. No bio.)

**Appearance tab:**
- Theme picker: icon + radio (Light / Dark / System)
- Tooltips: "Show tooltips" checkbox
- Background image: dark mode picker + light mode picker

**Vaults tab:**
- List: vault name + Active badge (active vault) + path
- Active vault: pencil + trash
- Inactive vault: power icon (to activate) + pencil + trash
- "+ Add Vault" → native macOS file picker

**Blogs tab:**
- List: blog name + GitHub repo + Cloudflare/Vercel project + sync (↻) + edit (✏) + delete (🗑)
- "+ Add Blog" → Add Blog form (breadcrumb: Settings / Add Blog)
- Delete blog: confirm + option to delete local synced posts

**General tab:**
- Editor: font size, tab size (soft tabs, default 2 spaces)
- Backup: directory picker, number to keep, status ("Last backup: N ago")
- Personal dictionary: view + remove entries
- Grammar check: on/off toggle
- Tip + bug report: two columns at bottom
  - Left: `$` amount input + Tip button + "support via merch" link
  - Right: "Open a GitHub issue" link + feedback textarea + Send Feedback button

**Docs tab:**
- Sections: Getting Started, Daily Notes, Tags, Blog Publishing (`@` syntax), CMS Setup, Settings reference
- Read-only. Searchable.

---

## Testing Strategy

### Two-tier approach

**Fast — Vitest + @testing-library/react** (`npm run test`, target < 5s)

- Utilities: tag extraction, `@` parser (all field types, quote stripping, arbitrary fields), date formatting, note sorting, backup naming, post filename tracking, YAML↔`@` round-trip conversion
- Zustand stores: navigation history, section state, tag aggregation, publish state machine
- React components: accordion open/close, sidebar counts, tag pill render, title→body Tab/Enter focus, `@` popup trigger
- CodeMirror state: transactions, decorations (Node.js, no browser needed)

**Slow — Playwright + Electron** (`npm run test:e2e`, critical paths only)

- App launches → today's daily note opens
- Create note → `.md` file on disk
- Delete note → Trash
- Blank past daily note → auto-deleted on next launch
- Publish post → HTTP request sent, progress bar appears
- Backup → dated folder exists after launch

### Regression tests — live markdown

- `#hoobie #regression` on one line → two pills, both in TAGS, note under both
- `# Title` cursor on line → `#` visible; off → hides, text stays H1
- `**text**` cursor inside → `**` visible; outside → bold, hidden
- `` `code` `` cursor inside → backticks visible; outside → monospace box, hidden; back → visible
- Highlight "story" + Cmd+K → `[story]()` cursor between `()`
- Highlight "story" + Cmd+V with URL → `[story](url)` immediately
- `[story](url)` cursor off → underlined; cursor on → raw syntax
- Code block: no extra top gap at note start
- Code block: correct margins below list, heading, adjacent block
- Selection + Cmd+B → `**...**`; Cmd+I → `*...*`
- Click-drag selection; double-click word; triple-click line

### Regression tests — Xin bug list

- Tab in title → focus to body
- Enter in title → focus to body
- `#tag` in content → appears in TAGS sidebar count ≥ 1
- Click tag in sidebar → scrolls to first instance in open note
- Delete note → Trash (not gone permanently)
- Create note → `.md` file on disk with correct YAML front-matter
- Daily note on launch → `YYYY-MM-DD.md` exists
- Blank past daily note → auto-deleted silently on launch
- Navigation: 3-note chain → back/forward correct at each step
- Backup on launch → folder copy exists
- Empty vault on launch → warning shown
- `lastPublishedFilename` updated after publish
- Republish with changed filename → old remote deleted, new uploaded

### What NOT to test
- CSS / visual styling (eyes + mockup)
- Third-party library internals
- Platform-native behavior (Cmd+Z — verify manually in Phase 1)

---

## What's Cut vs Xin

| Feature | Xin | Tova | Reason |
|---------|-----|------|--------|
| Browser-style tabs | Yes (buggy) | No | Cut entirely |
| Archive / Journal / Ideas | Yes | No | Folders under Notes instead |
| Star/favorite | Yes | No | Not needed |
| `---` YAML front-matter shortcut | Yes | No | Replaced by `@` popup |
| Deep folder nesting | Yes | 1 level | Simpler, less bug-prone |
| Inline styles | Yes (everywhere) | Never | Antipattern in Electron/web |
| Title/body split inside CM | Yes (cursor bugs) | No | Title is separate `<input>` |
| No backups | Yes (data loss!) | No | First-class feature |
| Blank daily note accumulation | Yes | No | Auto-cleanup on launch |
| One-way blog sync | — | No | Bidirectional |
| Orphaned remote files on rename | Yes | No | `lastPublishedFilename` tracking |
| Hot pink accent | Yes | No | Replaced with Tova purple |
| Separate docs panel/icon | Yes | No | Lives in Settings Docs tab |

---

## Key File Structure

```
tova/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
├── .eslintrc.json
├── .prettierrc
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   └── ipc/
│   │       ├── notes.ts
│   │       ├── backup.ts
│   │       └── blog.ts
│   ├── preload/
│   │   └── index.ts
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Sidebar/
│       │   ├── Editor/
│       │   ├── Popup/        ← one shared component, reused everywhere
│       │   ├── Settings/
│       │   └── Docs/
│       ├── stores/           ← Zustand
│       ├── styles/
│       └── utils/
├── assets/
│   ├── bg-dark.jpg
│   └── bg-light.jpg
└── TUTORIAL.md
```

---

## References

- Xin: `~/Dev/xin-proj/xin/` — IPC patterns, CM6 setup, spell check, blog publish/sync, `@` parser
- Branding + mockups: `~/Dev/tova-proj/branding/`
- Mockups confirmed: main editor, sidebar open, `...` menu, Add Blog form, Settings (main, vault added, two vaults, add vault file picker), search icon states, search expanded, avatar/profile tab

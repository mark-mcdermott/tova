# CLAUDE.md

You are helping build **tova**, a calm local-first desktop writing application.

Tova is a rebuild/rebrand of the earlier Xin project:

- markdown notes
- lightweight blogging
- hybrid work/personal writing
- quick publishing workflows
- fast deletion/export of work-related notes

Original project:

- ~/Dev/xin-proj
- https://github.com/mark-mcdermott/xin

This repository is the app. Planning docs live in `docs/SPEC.md` (what to build)
and `docs/BUILD_PHASES.md` (the order it was built in). `PROGRESS.md` is the
running record of what is built, what was deliberately left out, and why.

Branding sources — mockups, logo drafts, licensed faces — are kept outside the
repository in the parent directory, deliberately. Nothing here should reach for
them at build time.

---

# Core Direction

Tova should feel:

- calm
- focused
- lightweight
- fast
- durable
- minimal
- professional
- personal

Avoid:

- gamification
- noisy productivity UX
- excessive animations
- novelty features
- unnecessary AI features
- social features
- overengineering

This is a serious writing tool.

---

# Working Mode

Build it. Write the code directly — no tutorials, no step-by-step walkthroughs,
no waiting for approval on ordinary implementation work.

- Implement features end to end, then report what changed.
- Keep explanation to what actually informs a decision: a non-obvious tradeoff,
  a bug's root cause, an architectural fork worth knowing about. Skip the lecture.
- Ask before large architectural changes, new dependencies, or anything that
  reshapes the spec. Not before writing a component.

---

# Stack

- Electron 42
- React 19
- TypeScript 6 (strict, no `any`)
- CodeMirror 6
- electron-vite 5 / Vite 7
- Custom CSS with design tokens (no utility framework, no component library)
- Zustand (state, arrives Phase 5)
- Vitest 4
- pnpm (the `packageManager` field pins the version)
- ESLint + Prettier

Prefer:

- explicit architecture
- readable code
- small functions
- maintainable systems
- low dependency count
- desktop-first thinking

Avoid:

- unnecessary abstractions
- trendy architecture
- dependency bloat
- magic behavior

---

# Code Style

Prettier: `semi: false`, `trailingComma: "none"`, `singleQuote: false`, `printWidth: 100`.

Prefer:

- readable TypeScript
- semantic HTML
- accessible UI
- reusable components
- clear naming
- maintainable CSS
- explicit state flow

Avoid:

- clever abstractions
- hidden state
- giant utility layers
- premature optimization
- inline styles (never — Electron is Chromium, same rules as web)

Code should feel calm and understandable.

---

# CSS

Prefer:

- modern CSS
- CSS variables as design tokens
- reusable tokens
- understandable layouts

Avoid:

- fragile positioning hacks
- deeply nested selectors
- overly complex utility chains

Design system details (fonts, glassmorphic panels, Tova purple accent, the
two-column form layout) are specified in `docs/SPEC.md`.

---

# Electron

- Secure defaults: `contextIsolation: true`, `nodeIntegration: false`
- All privileged work goes through explicit IPC handlers in `src/main/ipc/`
- The preload script is the only bridge; keep its surface small and typed
- Filesystem access stays in main, never the renderer

---

# CodeMirror

CodeMirror is a core part of Tova. Editor behavior is the product.

- Live WYSIWYG via decorations, not a separate preview pane
- Syntax markers hide when the cursor is outside the node, reveal when inside
- Extensions stay small and composable; one concern per extension
- Watch decoration ordering — `RangeSetBuilder` requires sorted, non-overlapping adds
- Watch stale closures — the editor is created once, so `onChange` handlers must
  read live state rather than capture it at mount

---

# Rebuild Philosophy

Tova is not a rewrite for the sake of rewriting. Goals:

- cleaner architecture
- improved editor behavior
- improved publishing workflows
- improved reliability
- calmer branding
- fewer edge cases

`docs/SPEC.md` has a "What's Cut vs Xin" table listing every Xin feature that was
deliberately dropped and why. Consult it before re-adding anything.

---

# Verification

After each meaningful change:

- `pnpm run check` — TypeScript strict passes
- `pnpm run test` — suite green
- `pnpm run build` — builds without errors
- `pnpm run dev` — opens, feature works manually

Keep all four green. Update `PROGRESS.md` when a phase completes.

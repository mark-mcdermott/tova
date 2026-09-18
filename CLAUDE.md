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
running record of what is built, what was deliberately left out, and why, and
`docs/ROADMAP.md` is the only forward-looking one — what is agreed and not yet
built. Add to it rather than letting an agreed feature live in a chat thread.

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

# What Ships On, and What Asks

Most work costs the reader nothing and should not announce itself. A better
editor behaviour, a fixed bug, a construct that now renders — those ship on,
with no switch and no prompt.

A feature that costs something the reader should consent to — a download, a
network connection, their writing leaving the machine, real disk — ships
**off**, in Settings, discoverable. Off is the answer, not a prompt.

Tova asks **one** question, once, on the first run: what kind of install this
is. It earns its place by gathering the two costs that already exist — the
grammar dictionary's 15MB and the update check's connection — into a single
moment, rather than ambushing somebody the first time they open Settings.
`greeted` records the answer, lives in Application Support, survives every
update, and is never asked again.

Adding a second first-run question is the thing to resist. Each one keys on a
new preference defaulting to false, so it shows to _everybody_ on the update
that introduces it. Two or three over a year and Tova interrupts you every time
it updates, which is the noisy productivity UX at the top of this file.

Spelling is the case on the other side, and worth keeping in mind: always on,
no question, no switch to find, because it is the system's own checker and
costs nothing to include.

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

- Tauri 2 (Rust backend, WKWebView on macOS)
- React 19
- TypeScript 6 (strict, no `any`)
- CodeMirror 6
- Vite 7
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
- inline styles (never — a webview is a browser, same rules as web)

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

# Tauri

- Every privileged operation is an explicit `#[tauri::command]` in `src-tauri/src/`
- `src-tauri/bridge.js` is the only bridge — it builds `window.tova` out of
  those commands, and is the counterpart of the preload Electron used to have
- Filesystem access stays in Rust, never the renderer
- A core command is refused unless `src-tauri/capabilities/` names it, and the
  refusal only reaches the webview's console — so a missing permission reads as
  a feature that quietly does nothing. `surface.conformance` and
  `capabilities.conformance` are what make both kinds of gap fail loudly
- The renderer knows nothing about Tauri. It calls `window.tova`, which is
  declared in `src/renderer/tova.d.ts` and described in `src/shared/types.ts`

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
- `pnpm run build` — the renderer builds without errors
- `cargo test --manifest-path src-tauri/Cargo.toml` — the Rust suite is green
- `pnpm run tauri:dev` — opens, feature works manually

Keep all four green. Update `PROGRESS.md` when a phase completes.

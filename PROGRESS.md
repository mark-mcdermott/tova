# Tova — Progress

## Current state

- **Phase 0** — Project scaffold. Complete.
- **Phase 1** — Editor core. Complete.
- **Phase 2** — File system & note management. Next.

## Phase 1 notes

Live WYSIWYG covers bold, italic, strikethrough, inline code, headings (h1–h6),
fenced code blocks, links, and both tag styles. Syntax markers reveal while the
cursor is inside a construct and hide when it leaves.

The toolbar and the keymap are generated from one list in
`src/renderer/components/Editor/formats.ts`, so a button and its advertised
shortcut cannot drift apart.

### Carried forward

- **Alagambe script font is not bundled.** The note title falls back to Snell
  Roundhand. Drop the real face into `assets/` and update `--font-script`.
- **No syntax highlighting inside code blocks.** Needs `@codemirror/language-data`,
  which is a new dependency and a meaningful bundle cost.
- **Tailwind is installed and wired into Vite but unused** — all styling is plain
  CSS with tokens in `src/renderer/styles/globals.css`. Either adopt it or drop
  the dependency.
- Blockquotes, tables, and the Cmd+K link popup are specified but belong to
  later phases.

## To resume

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/BUILD_PHASES.md`, and this file.

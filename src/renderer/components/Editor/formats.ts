import { EditorView, KeyBinding } from "@codemirror/view"
import { ChangeSet } from "@codemirror/state"

export type Format =
  | { kind: "wrap"; before: string; after: string }
  | { kind: "linePrefix"; prefix: string }
  | { kind: "codeBlock" }

export interface ToolbarItem {
  key: string
  label: string
  title: string
  shortcut: string
  format: Format
  /**
   * False for a format that keeps its shortcut and gives up its button. Plain
   * is the only one: the row reads as a set of things to add, and a control for
   * taking one back off sat oddly at the head of it. Cmd+Shift+0 stays, because
   * it is the 0 of the 0/1/2 the headings use.
   */
  inToolbar?: boolean
}

/**
 * Single source of truth for the bottom toolbar and the editor keymap, so a
 * button and its advertised shortcut can never drift apart. Every entry is
 * bound; `inToolbar: false` is one that is not also drawn.
 */
export const toolbarItems: ToolbarItem[] = [
  {
    key: "plain",
    label: "T",
    title: "Plain — clears a heading or bullet (Cmd+Shift+0)",
    shortcut: "Mod-Shift-0",
    format: { kind: "linePrefix", prefix: "" },
    inToolbar: false
  },
  {
    key: "h1",
    label: "H1",
    title: "Heading 1 (Cmd+Shift+1)",
    shortcut: "Mod-Shift-1",
    format: { kind: "linePrefix", prefix: "# " }
  },
  {
    key: "h2",
    label: "H2",
    title: "Heading 2 (Cmd+Shift+2)",
    shortcut: "Mod-Shift-2",
    format: { kind: "linePrefix", prefix: "## " }
  },
  {
    key: "bold",
    label: "B",
    title: "Bold (Cmd+B)",
    shortcut: "Mod-b",
    format: { kind: "wrap", before: "**", after: "**" }
  },
  {
    key: "italic",
    label: "i",
    title: "Italic (Cmd+I)",
    shortcut: "Mod-i",
    format: { kind: "wrap", before: "*", after: "*" }
  },
  {
    key: "strike",
    label: "~~",
    title: "Strikethrough (Cmd+Shift+X)",
    shortcut: "Mod-Shift-x",
    format: { kind: "wrap", before: "~~", after: "~~" }
  },
  {
    key: "inlineCode",
    label: "<>",
    title: "Inline code (Cmd+E)",
    shortcut: "Mod-e",
    format: { kind: "wrap", before: "`", after: "`" }
  },
  {
    key: "codeBlock",
    label: "</>",
    title: "Code block (Cmd+Shift+E)",
    shortcut: "Mod-Shift-e",
    format: { kind: "codeBlock" }
  },
  {
    key: "list",
    label: "≡",
    title: "List (Cmd+Shift+L)",
    shortcut: "Mod-Shift-l",
    format: { kind: "linePrefix", prefix: "- " }
  }
]

/** Leading indent, then any single block marker (heading, bullet, or number). */
const BLOCK_MARKER = /^(\s*)(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+\.[ \t]+)?/

function applyWrap(view: EditorView, before: string, after: string): void {
  const { state } = view
  const { from, to } = state.selection.main
  const selected = state.sliceDoc(from, to)

  const outerFrom = from - before.length
  const outerTo = to + after.length
  const wrappedOutside =
    outerFrom >= 0 &&
    outerTo <= state.doc.length &&
    state.sliceDoc(outerFrom, from) === before &&
    state.sliceDoc(to, outerTo) === after

  if (wrappedOutside) {
    view.dispatch({
      changes: [
        { from: outerFrom, to: from },
        { from: to, to: outerTo }
      ],
      selection: { anchor: outerFrom, head: outerFrom + selected.length }
    })
    return
  }

  const wrappedInside =
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)

  if (wrappedInside) {
    const inner = selected.slice(before.length, selected.length - after.length)
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length }
    })
    return
  }

  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: {
      anchor: from + before.length,
      head: from + before.length + selected.length
    }
  })
}

function applyLinePrefix(view: EditorView, prefix: string): void {
  const { state } = view
  const changes: { from: number; to: number; insert: string }[] = []
  const first = state.doc.lineAt(state.selection.main.from)
  const last = state.doc.lineAt(state.selection.main.to)

  for (let number = first.number; number <= last.number; number++) {
    const line = state.doc.line(number)
    const marker = BLOCK_MARKER.exec(line.text)
    if (!marker) continue

    const indent = marker[1]
    const existing = marker[0].slice(indent.length)

    // Applying the prefix a line already has removes it, so the buttons toggle.
    const next = existing === prefix ? "" : prefix
    if (next === existing) continue

    // Just the marker, not the whole line: rewriting the line moved the caret
    // to its start, which on a blank line left it sitting behind the bullet.
    changes.push({
      from: line.from + indent.length,
      to: line.from + marker[0].length,
      insert: next
    })
  }

  if (changes.length === 0) return

  const changeSet = ChangeSet.of(changes, state.doc.length)
  view.dispatch({
    changes: changeSet,
    // Associate forwards, so a marker inserted at the caret goes in front of
    // it: on a blank line the caret ends up past "- ", ready to type.
    selection: state.selection.map(changeSet, 1)
  })
}

function applyCodeBlock(view: EditorView): void {
  const { state } = view
  const first = state.doc.lineAt(state.selection.main.from)
  const last = state.doc.lineAt(state.selection.main.to)
  const body = state.sliceDoc(first.from, last.to)

  view.dispatch({
    changes: { from: first.from, to: last.to, insert: `\`\`\`\n${body}\n\`\`\`` },
    selection: { anchor: first.from + 4 }
  })
}

export function applyFormat(view: EditorView, format: Format): void {
  switch (format.kind) {
    case "wrap":
      applyWrap(view, format.before, format.after)
      break
    case "linePrefix":
      applyLinePrefix(view, format.prefix)
      break
    case "codeBlock":
      applyCodeBlock(view)
      break
  }
  view.focus()
}

/** What the toolbar draws. The keymap below binds everything, drawn or not. */
export const toolbarButtons: ToolbarItem[] = toolbarItems.filter((item) => item.inToolbar !== false)

export const formatKeymap: KeyBinding[] = toolbarItems.map((item) => ({
  key: item.shortcut,
  preventDefault: true,
  run: (view) => {
    applyFormat(view, item.format)
    return true
  }
}))

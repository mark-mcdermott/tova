import { Command, EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"
import type { SyntaxNode } from "@lezer/common"

/** The item the cursor is in, or null if it is not in a list at all. */
function listItemAt(state: EditorState, pos: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; ) {
    if (node.name === "ListItem") return node
    node = node.parent
  }
  return null
}

/** Indent, marker and the space after it, exactly as this item wrote them. */
const BULLET_PREFIX = /^\s*[-*+][ \t]+/

/**
 * Enter at the end of a bullet starts the next one on the very next line.
 *
 * The markdown keymap's own Enter would leave a blank line between the two,
 * and correctly so: a list whose items are already separated by blank lines is
 * a loose list, and CommonMark renders it with the items spaced out. But the
 * spacing is a rendering subtlety nobody is thinking about while typing a list
 * of three things, and a note that opens a gap every time you press Enter is
 * not what anyone means.
 *
 * Only that one case. Splitting an item mid-line, ending a list from an empty
 * item, numbered items and quotes all fall through to the markdown keymap,
 * which knows about renumbering and nesting.
 */
export const continueBullet: Command = (view: EditorView): boolean => {
  const { state } = view
  const range = state.selection.main
  if (state.selection.ranges.length > 1 || !range.empty) return false

  const line = state.doc.lineAt(range.head)
  if (range.head !== line.to) return false

  // The tree decides whether this is a list, so a dash inside a fenced block
  // stays a dash.
  const item = listItemAt(state, range.head)
  const mark = item?.getChild("ListMark") ?? null
  if (mark === null || state.doc.lineAt(mark.from).number !== line.number) return false

  const prefix = BULLET_PREFIX.exec(line.text)
  // An empty item is how a reader ends a list; let the markdown keymap do it.
  if (prefix === null || prefix[0].length === line.text.length) return false

  const insert = `\n${prefix[0]}`
  view.dispatch({
    changes: { from: range.head, insert },
    selection: { anchor: range.head + insert.length },
    userEvent: "input",
    scrollIntoView: true
  })
  return true
}

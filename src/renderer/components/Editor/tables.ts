/*!
Tables, which are the one construct the editor cannot draw with decorations
alone.

Everything else here paints a run of text: a heading's `#` goes grey, a bullet's
dash wears a circle, the ink changes and the characters stay where they are. A
table wants a grid — columns as wide as their longest cell, across lines
CodeMirror lays out one at a time and independently of each other.

So the grid is made of text. The body font is monospace, so padding the cells
with real spaces is the whole of the alignment, and the result is still text:
still editable in place, still a table to whatever reads the file next, and
never relaid out under the cursor. `src/shared/tables.ts` does the arithmetic.

What decorations are left to do is the quiet part — dimming the pipes, leaning
on the header, and taking the delimiter row out of sight when it is not being
edited, the way a code fence's ``` lines already go.
*/

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { EditorState, Range } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"
import type { SyntaxNode } from "@lezer/common"
import { alignTable } from "../../../shared/tables"

const pipe = Decoration.mark({ class: "cm-table-pipe" })
const headLine = Decoration.line({ class: "cm-table-head" })
const ruleLine = Decoration.line({ class: "cm-table-rule" })

/** The lines a table covers, first and last included. */
function linesOf(state: EditorState, node: SyntaxNode): { first: number; last: number } {
  return {
    first: state.doc.lineAt(node.from).number,
    last: state.doc.lineAt(node.to).number
  }
}

/**
 * The table the cursor is in, or null.
 *
 * By line rather than by position, so a cursor at the very end of a row counts
 * as inside it — which is where the cursor is for most of the typing anyone
 * does in a table.
 */
export function tableAt(state: EditorState, pos: number): { from: number; to: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1)
  while (node !== null && node.name !== "Table") node = node.parent
  if (node === null) return null

  const line = state.doc.lineAt(pos).number
  const { first, last } = linesOf(state, node)
  return line >= first && line <= last ? { from: node.from, to: node.to } : null
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const decorations: Range<Decoration>[] = []
  const cursor = state.selection.main.head

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "Table") return

        const table = node.node
        const { first, last } = linesOf(state, table)

        decorations.push(headLine.range(state.doc.line(first).from))

        /*
         * The delimiter row gives up its ink and keeps its place — the same
         * trick the bullet and the task box use, and for the same reason.
         *
         * Hiding it outright was the first attempt and it is wrong here. A
         * code fence's ``` lines sit at the top and bottom of their block, so
         * hiding them trims the edges; a delimiter sits in the middle, and
         * taking a line out of the middle moves every row under it. At the
         * prose line-height that is a 42px jump each time the caret enters or
         * leaves a table — the same relayout-under-the-cursor that ruled out
         * drawing the whole table as a widget in the first place.
         *
         * So the line stays, its text goes transparent, and a rule is drawn
         * across it. Changing ink moves nothing, which is what makes the
         * per-line reveal safe here: the caret lands on the row and the dashes
         * come back with the table exactly as tall as it was.
         *
         * Second line of a table is always its delimiter; the parser does not
         * call it a table otherwise.
         */
        if (last > first) {
          const rule = state.doc.line(first + 1)
          const on = cursor >= rule.from && cursor <= rule.to
          if (!on) decorations.push(ruleLine.range(rule.from))
        }

        for (let child = table.firstChild; child !== null; child = child.nextSibling) {
          for (let cell = child.firstChild; cell !== null; cell = cell.nextSibling) {
            if (cell.name === "TableDelimiter") {
              decorations.push(pipe.range(cell.from, cell.to))
            }
          }
        }
      }
    })
  }

  return Decoration.set(decorations, true)
}

const tableDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = build(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/**
 * Lays a table out when the caret leaves it.
 *
 * On leaving rather than on every keystroke: padding as you type would push
 * the rest of the row away from the caret mid-word, which is the one thing
 * that would make a table worse to write in than it is now.
 *
 * `alignTable` is idempotent, so a table already laid out produces no
 * transaction at all and the document does not drift.
 */
const alignOnLeave = EditorView.updateListener.of((update) => {
  if (!update.selectionSet && !update.docChanged) return

  const before = tableAt(update.startState, update.startState.selection.main.head)
  if (before === null) return

  const after = tableAt(update.state, update.state.selection.main.head)
  if (after !== null && after.from === before.from) return

  // Positions are from the state before this update, so they are mapped onto
  // the one it produced before anything is read at them.
  const from = update.changes.mapPos(before.from)
  const to = update.changes.mapPos(before.to, 1)
  const { state } = update
  if (to > state.doc.length) return

  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  const lines: string[] = []
  for (let number = first.number; number <= last.number; number += 1) {
    lines.push(state.doc.line(number).text)
  }

  const aligned = alignTable(lines)
  const insert = aligned.join("\n")
  if (insert === lines.join("\n")) return

  // Dispatching inside an update is refused, so this waits for the one in
  // flight to finish.
  queueMicrotask(() => {
    if (update.view.state !== state) return
    update.view.dispatch({
      changes: { from: first.from, to: last.to, insert },
      userEvent: "format.table"
    })
  })
})

export function tableSupport() {
  return [tableDecorations, alignOnLeave]
}

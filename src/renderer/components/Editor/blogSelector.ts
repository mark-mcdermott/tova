import { EditorView } from "@codemirror/view"
import { toIsoDate } from "../../../shared/date"

export interface SelectorAnchor {
  x: number
  y: number
  /** Where the `@` sits, so choosing a blog knows what to replace. */
  from: number
}

/**
 * Typing `@` on an otherwise empty line offers the configured blogs. Anything
 * else typed after it — an email address, a mention — closes the offer again,
 * so the `@` stays an ordinary character until a blog is actually chosen.
 */
export function blogSelector(onAnchor: (anchor: SelectorAnchor | null) => void) {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged && !update.selectionSet) return

    const { state } = update
    const range = state.selection.main
    if (!range.empty) {
      onAnchor(null)
      return
    }

    const line = state.doc.lineAt(range.head)
    if (line.text.slice(0, range.head - line.from) !== "@") {
      onAnchor(null)
      return
    }

    // Measuring needs the position to be laid out, and throws when it is not.
    // A popup that cannot be placed simply is not offered.
    let coords: { left: number; bottom: number } | null = null
    try {
      coords = update.view.coordsAtPos(range.head)
    } catch {
      coords = null
    }

    if (coords === null) {
      onAnchor(null)
      return
    }

    onAnchor({ x: coords.left, y: coords.bottom + 4, from: line.from })
  })
}

/** The block a chosen blog leaves behind, with the cursor left on the title. */
export function insertPostBlock(view: EditorView, from: number, blog: string, today: Date): void {
  const date = toIsoDate(today)
  const header = `@${blog} post\n@title `
  const rest = `\n@date ${date}\n\n`
  const line = view.state.doc.lineAt(from)

  view.dispatch({
    changes: { from, to: line.to, insert: header + rest },
    selection: { anchor: from + header.length }
  })
  view.focus()
}

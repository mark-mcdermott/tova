import { ViewPlugin, DecorationSet, Decoration, EditorView, ViewUpdate } from "@codemirror/view"
import { RangeSetBuilder } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"

function cursorOverlaps(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true
  }
  return false
}

const hideReplace = Decoration.replace({})
const boldMark = Decoration.mark({ class: "cm-bold" })
const italicMark = Decoration.mark({ class: "cm-italic" })
const codeMark = Decoration.mark({ class: "cm-inline-code" })
const headingMarks: Record<number, Decoration> = {
  1: Decoration.mark({ class: "cm-heading cm-h1" }),
  2: Decoration.mark({ class: "cm-heading cm-h2" }),
  3: Decoration.mark({ class: "cm-heading cm-h3" }),
}

export function markdownDecorations() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view)
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>() 
        const tree = syntaxTree(view.state)

        tree.cursor().iterate((node) => {
          const { from, to, name } = node

          if (name === "StrongEmphasis") {
            const inside = cursorOverlaps(view, from, to)
            if (inside) {
              builder.add(from, from + 2, boldMark)
            } else {
              builder.add(from, from + 2, hideReplace)
              builder.add(from + 2, to - 2, boldMark)
              builder.add(to - 2, to, hideReplace)
            }
          }

          if (name === "Emphasis") {
            const inside = cursorOverlaps(view, from, to)
            if (inside) {
            builder.add(from, to, italicMark)
            } else {
              builder.add(from, from + 1, hideReplace)
              builder.add(from, from + 1, italicMark)
              builder.add(to - 1, to, hideReplace)
            }
          }

          if (name === "InlineCode") {
            const inside = cursorOverlaps(view, from, to)
            if (inside) {
              builder.add(from, to, codeMark)
            } else {
              builder.add(from, from + 1, hideReplace)
              builder.add(from, from + 1, codeMark)
              builder.add(to - 1, to, hideReplace)
            }
          }

          if (name.startsWith("ATXHeading")) {
            const level = parseInt(name.replace("ATXHeading", ""), 10)
            const mark = headingMarks[level] ?? headingMarks[1]
            const inside = cursorOverlaps(view, from, to)
            if (inside) {
              builder.add(from, to, mark)
            } else {
              builder.add(from, from + level + 1, hideReplace)
              builder.add(from + level + 1, to, mark)
            }
          }
        })

        return builder.finish()
      }
    },
    { decorations: (v) => v.decorations }
  )
}
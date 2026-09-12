import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { EditorState, Extension, Range, StateEffect, StateField } from "@codemirror/state"

/** Anything the editor can draw a line under. */
export interface Span {
  from: number
  to: number
}

/*
 * A layer of underlines fed by a checker that answers later than the edit
 * which asked it.
 *
 * There are two of these now — spelling and grammar — and they differ only in
 * what they are called, how long they wait, and what the checker returns. The
 * rest is the same problem each time: hold the last answer, map it through
 * every edit since so an underline stays under its own words while the reader
 * carries on typing, and ask again when the typing stops.
 */
export function underlineLayer<T extends Span>(
  className: string,
  delay: number,
  /*
   * A layer that owns the words it marks. A span overlapping one of those is
   * not drawn — two checkers reading one document will both have something to
   * say about the same word, and two dotted lines at the same offset are one
   * muddy line rather than two opinions. Harper calls a misspelt word at the
   * start of a sentence a capitalisation note, so `teh` was underlined twice.
   */
  yieldsTo?: StateField<Span[]>
) {
  const set = StateEffect.define<T[]>()
  const mark = Decoration.mark({ class: className })

  const field = StateField.define<T[]>({
    create: () => [],
    update(spans, transaction) {
      for (const effect of transaction.effects) {
        if (effect.is(set)) return effect.value
      }
      if (!transaction.docChanged) return spans

      return (
        spans
          /*
           * An edit inside a marked span makes it stale, so it goes and the
           * next pass says whether it comes back. Mapping alone is not enough
           * — the mapped range simply grows to cover what was typed, which
           * leaves a word underlined while it is being corrected. Asked on
           * the old positions, before they move.
           */
          .filter((span) => !transaction.changes.touchesRange(span.from, span.to))
          .map((span) => ({
            ...span,
            from: transaction.changes.mapPos(span.from),
            to: transaction.changes.mapPos(span.to)
          }))
          .filter((span) => span.to > span.from)
      )
    }
  })

  function decorate(spans: T[], owned: Span[], length: number): DecorationSet {
    const ranges: Range<Decoration>[] = []
    for (const span of spans) {
      if (span.from < 0 || span.to > length || span.to <= span.from) continue
      if (owned.some((other) => span.from < other.to && span.to > other.from)) continue
      ranges.push(mark.range(span.from, span.to))
    }
    return Decoration.set(ranges, true)
  }

  const owned = (state: EditorState): Span[] =>
    yieldsTo === undefined ? [] : (state.field(yieldsTo, false) ?? [])

  const paint = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = decorate(
          view.state.field(field),
          owned(view.state),
          view.state.doc.length
        )
      }

      update(update: ViewUpdate): void {
        this.decorations = decorate(
          update.state.field(field),
          owned(update.state),
          update.state.doc.length
        )
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )

  /**
   * Asks for a fresh pass when the writing pauses, and once when a note opens
   * — a note is mostly words nobody typed this session, and those need
   * checking too.
   */
  function checking(request: (text: string) => void): Extension {
    let timer: ReturnType<typeof setTimeout> | null = null

    return [
      field,
      paint,
      ViewPlugin.fromClass(
        class {
          constructor(view: EditorView) {
            request(view.state.doc.toString())
          }
        }
      ),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => request(update.state.doc.toString()), delay)
      })
    ]
  }

  /** The span under a position, for the menu that offers its suggestions. */
  function at(spans: T[], position: number): T | null {
    return spans.find((span) => position >= span.from && position <= span.to) ?? null
  }

  return { set, field, checking, at }
}

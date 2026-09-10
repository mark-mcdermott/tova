import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { Extension, Range, StateEffect, StateField } from "@codemirror/state"
import { Match, findMatches } from "../../../shared/noteSearch"

/** The bar lives in React, so what it wants painted arrives as an effect. */
export const setSearchHits = StateEffect.define<{ matches: Match[]; current: number }>()

const hit = Decoration.mark({ class: "cm-search-hit" })
const currentHit = Decoration.mark({ class: "cm-search-hit cm-search-hit-current" })

interface Hits {
  matches: Match[]
  /** Index of the one the reader is standing on, or -1. */
  current: number
}

/**
 * What the bar last asked for, mapped through every edit since.
 *
 * Mapped rather than cleared so the highlights stay under their words while
 * the reader types — the bar recomputes on the next keystroke anyway, and a
 * flicker in between reads as the search having broken.
 */
export const searchHits = StateField.define<Hits>({
  create: () => ({ matches: [], current: -1 }),
  update(hits, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSearchHits)) return effect.value
    }
    if (!transaction.docChanged) return hits

    return {
      current: hits.current,
      matches: hits.matches
        .map((match) => ({
          from: transaction.changes.mapPos(match.from),
          to: transaction.changes.mapPos(match.to)
        }))
        .filter((match) => match.to > match.from)
    }
  }
})

function decorate({ matches, current }: Hits, length: number): DecorationSet {
  const ranges: Range<Decoration>[] = []
  matches.forEach((match, at) => {
    if (match.from < 0 || match.to > length || match.to <= match.from) return
    ranges.push((at === current ? currentHit : hit).range(match.from, match.to))
  })
  return Decoration.set(ranges, true)
}

const paint = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = decorate(view.state.field(searchHits), view.state.doc.length)
    }

    update(update: ViewUpdate): void {
      this.decorations = decorate(update.state.field(searchHits), update.state.doc.length)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

export function searchHighlighting(): Extension {
  return [searchHits, paint]
}

/**
 * Paints the matches and brings the current one into view.
 *
 * The selection is left alone: moving the caret would reveal the raw markdown
 * under it — that is the live-preview contract — so a search would rewrite the
 * page it was searching.
 */
export function showMatches(view: EditorView, matches: Match[], current: number): void {
  const landing = matches[current]

  view.dispatch({
    effects: [
      setSearchHits.of({ matches, current }),
      ...(landing === undefined ? [] : [EditorView.scrollIntoView(landing.from, { y: "center" })])
    ]
  })
}

/** Recomputes against the live document, which is what the reader is looking at. */
export function matchesIn(view: EditorView, query: string): Match[] {
  return findMatches(view.state.doc.toString(), query)
}

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { Extension, Range, StateEffect, StateField } from "@codemirror/state"

export interface GrammarNote {
  from: number
  to: number
  message: string
  kind: string
  suggestions: string[]
}

/** Results arrive later than the edit that asked for them, so they come in as an effect. */
export const setGrammarNotes = StateEffect.define<GrammarNote[]>()

const mark = Decoration.mark({ class: "cm-grammar" })

/**
 * The notes Harper last returned, mapped through every edit since. Mapping
 * rather than clearing means an underline stays under its own words while the
 * reader carries on typing, instead of flickering off and back.
 */
export const grammarNotes = StateField.define<GrammarNote[]>({
  create: () => [],
  update(notes, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setGrammarNotes)) return effect.value
    }
    if (!transaction.docChanged) return notes

    return notes
      .map((note) => ({
        ...note,
        from: transaction.changes.mapPos(note.from),
        to: transaction.changes.mapPos(note.to)
      }))
      // An edit inside a flagged span makes the note stale; drop it and wait
      // for the next pass rather than underlining the wrong words.
      .filter((note) => note.to > note.from)
  }
})

function decorate(notes: GrammarNote[], length: number): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const note of notes) {
    if (note.from >= 0 && note.to <= length && note.to > note.from) {
      ranges.push(mark.range(note.from, note.to))
    }
  }
  return Decoration.set(ranges, true)
}

const paint = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = decorate(view.state.field(grammarNotes), view.state.doc.length)
    }

    update(update: ViewUpdate): void {
      this.decorations = decorate(update.state.field(grammarNotes), update.state.doc.length)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/**
 * Asks for a fresh pass when the writing pauses. Grammar is not spelling: it
 * needs whole sentences, so checking mid-word would flag the writer for not
 * having finished typing yet.
 */
export function grammarChecking(request: (text: string) => void, delay = 700): Extension {
  let timer: ReturnType<typeof setTimeout> | null = null

  return [
    grammarNotes,
    paint,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => request(update.state.doc.toString()), delay)
    })
  ]
}

/** The note under a position, for the menu that offers its suggestions. */
export function noteAt(notes: GrammarNote[], position: number): GrammarNote | null {
  return notes.find((note) => position >= note.from && position <= note.to) ?? null
}

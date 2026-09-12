import type { Extension } from "@codemirror/state"
import { spellingSpans } from "./spelling"
import { underlineLayer, type Span } from "./underlines"

export interface GrammarNote extends Span {
  message: string
  kind: string
  suggestions: string[]
}

/*
 * Grammar is not spelling: it needs whole sentences, so checking mid-word
 * would flag the writer for not having finished typing yet. Spelling waits a
 * shorter time, because a word is finished sooner than a sentence is.
 */
const layer = underlineLayer<GrammarNote>("cm-grammar", 700, spellingSpans)

/** Results arrive later than the edit that asked for them, so they come in as an effect. */
export const setGrammarNotes = layer.set

/** The notes the checker last returned, mapped through every edit since. */
export const grammarNotes = layer.field

export function grammarChecking(request: (text: string) => void): Extension {
  return layer.checking(request)
}

/** The note under a position, for the menu that offers its suggestions. */
export function noteAt(notes: GrammarNote[], position: number): GrammarNote | null {
  return layer.at(notes, position)
}

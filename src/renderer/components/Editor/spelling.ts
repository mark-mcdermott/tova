import type { Extension } from "@codemirror/state"
import type { SpellingSpan } from "../../../shared/types"
import { underlineLayer } from "./underlines"

/*
 * The red underlines, drawn by Tova rather than by the webview.
 *
 * The webview draws its own, but only under a word as it is typed — so a note
 * written yesterday opened with nothing underlined in it, which reads as
 * spellchecking being broken rather than as a checker with an opinion about
 * when to speak. It also kept a separate word list, so a word added through
 * "Add to dictionary" went on being underlined by it.
 *
 * Asking NSSpellChecker for the whole note settles both: one dictionary —
 * the same one the right-click menu and "Add to dictionary" use — and every
 * word in the note checked, not only the ones typed since it opened.
 */
const layer = underlineLayer<SpellingSpan>("cm-spelling", 400)

export const setSpellingSpans = layer.set
export const spellingSpans = layer.field

export function spellChecking(request: (text: string) => void): Extension {
  return layer.checking(request)
}

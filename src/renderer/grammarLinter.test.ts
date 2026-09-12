import { describe, it, expect } from "vitest"
import { notesFrom, type RawLint } from "./grammarLinter"

/*
 * Spelling has one checker in Tova, and it is the system's: the one the
 * right-click menu asks, the one "Add to dictionary" writes to, and the one
 * that draws the red underline.
 *
 * Harper reports spelling as well, out of a dictionary of its own that knows
 * nothing about the words the reader has added — so its spelling notes
 * underlined words Tova had been told were words, in a second colour, with a
 * menu that could not offer to add them.
 */
function lint(kind: string, message: string, replacements: string[] = []): RawLint {
  return {
    span: () => ({ start: 0, end: 4 }),
    message: () => message,
    lint_kind: () => kind,
    suggestions: () => replacements.map((text) => ({ get_replacement_text: () => text }))
  }
}

describe("what the grammar checker hands to the editor", () => {
  it("keeps a note about a sentence", () => {
    const notes = notesFrom([lint("Agreement", "Make the verb agree with its subject.", ["were"])])

    expect(notes).toHaveLength(1)
    expect(notes[0].suggestions).toEqual(["were"])
  })

  it("drops a note about a word, which the system checker owns", () => {
    expect(notesFrom([lint("Spelling", "Did you mean to spell `teh` this way?", ["the"])])).toEqual(
      []
    )
  })

  it("keeps the rest when a spelling note is mixed in", () => {
    const notes = notesFrom([
      lint("Spelling", "spelt wrong"),
      lint("Repetition", "Did you mean to repeat this word?"),
      lint("Spelling", "also spelt wrong")
    ])

    expect(notes.map((note) => note.kind)).toEqual(["Repetition"])
  })

  /* Six is what the menu can show without becoming a list to read. */
  it("offers no more suggestions than a menu can hold", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g", "h"]
    expect(notesFrom([lint("WordChoice", "pick one", many)])[0].suggestions).toHaveLength(6)
  })

  it("leaves out a suggestion that says nothing", () => {
    expect(notesFrom([lint("Style", "…", ["", "better"])])[0].suggestions).toEqual(["better"])
  })
})

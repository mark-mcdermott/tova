import { describe, it, expect } from "vitest"
import { EditorState } from "@codemirror/state"
import { grammarNotes, markFor, noteAt, setGrammarNotes, GrammarNote } from "./grammar"

const note = (from: number, to: number): GrammarNote => ({
  from,
  to,
  message: "m",
  kind: "Grammar",
  suggestions: ["fix"]
})

function stateWith(doc: string, notes: GrammarNote[]) {
  const state = EditorState.create({ doc, extensions: [grammarNotes] })
  return state.update({ effects: setGrammarNotes.of(notes) }).state
}

describe("grammarNotes", () => {
  it("holds what the last pass returned", () => {
    expect(stateWith("one two", [note(0, 3)]).field(grammarNotes)).toHaveLength(1)
  })

  it("carries a note along as text is typed before it", () => {
    // Otherwise the underline sits under the wrong words until the next pass
    // comes back, which reads as the app blaming the wrong sentence.
    const state = stateWith("one two", [note(4, 7)])
    const next = state.update({ changes: { from: 0, insert: "zero " } }).state

    expect(next.field(grammarNotes)[0]).toMatchObject({ from: 9, to: 12 })
  })

  it("drops a note whose own words were edited", () => {
    const state = stateWith("one two", [note(4, 7)])
    const next = state.update({ changes: { from: 4, to: 7, insert: "" } }).state

    expect(next.field(grammarNotes)).toEqual([])
  })

  it("replaces the lot when a new pass arrives", () => {
    const state = stateWith("one two", [note(0, 3)])
    const next = state.update({ effects: setGrammarNotes.of([note(4, 7)]) }).state

    expect(next.field(grammarNotes)).toEqual([note(4, 7)])
  })
})

describe("noteAt", () => {
  const notes = [note(4, 7)]

  it("finds the note under the caret", () => {
    expect(noteAt(notes, 5)).not.toBeNull()
  })

  it("counts both edges, since a caret sits between characters", () => {
    expect(noteAt(notes, 4)).not.toBeNull()
    expect(noteAt(notes, 7)).not.toBeNull()
  })

  it("finds nothing elsewhere", () => {
    expect(noteAt(notes, 1)).toBeNull()
    expect(noteAt([], 5)).toBeNull()
  })
})

/*
 * The checker reports spelling alongside grammar, and a misspelling drawn in
 * the grammar colour meant the same mistake looked one way when it had just
 * been typed — where the system draws its own red squiggle over it — and
 * another when it was already on the page when the note opened.
 */
describe("which underline a note gets", () => {
  it("draws a misspelt word in spelling's colour", () => {
    expect(markFor("Spelling").spec.class).toContain("cm-grammar-spelling")
  })

  it("leaves every other kind in grammar's", () => {
    for (const kind of ["Agreement", "Repetition", "Capitalization", "Style"]) {
      expect(markFor(kind).spec.class).toBe("cm-grammar")
    }
  })

  it("keeps the shared class, which is what carries the underline itself", () => {
    expect(markFor("Spelling").spec.class).toContain("cm-grammar")
  })
})

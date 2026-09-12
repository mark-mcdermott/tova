import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { underlineLayer, type Span } from "./underlines"

/*
 * The machinery under both underline layers.
 *
 * A checker answers later than the edit that asked it, so its answer is
 * always about a document that has moved on. Spelling and grammar had the
 * same problem and would have had the same eighty lines each.
 */
const layer = underlineLayer<Span>("cm-test", 400)

function editor(doc: string, request: (text: string) => void = () => undefined) {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [layer.checking(request)] })
  })
  document.body.append(view.dom)
  return view
}

function marks(view: EditorView): string[] {
  return [...view.dom.querySelectorAll(".cm-test")].map((node) => node.textContent ?? "")
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
})

/*
 * Two checkers read the same document and both have something to say about a
 * misspelt word: Harper calls one at the start of a sentence a capitalisation
 * note. Two dotted lines at the same offset are one muddy line rather than
 * two opinions, so spelling keeps its words.
 */
describe("a layer that yields to another", () => {
  const spelling = underlineLayer<Span>("cm-owner", 400)
  const grammar = underlineLayer<Span>("cm-yields", 400, spelling.field)

  function both(doc: string) {
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [spelling.checking(() => undefined), grammar.checking(() => undefined)]
      })
    })
    document.body.append(view.dom)
    return view
  }

  const drawn = (view: EditorView, className: string) =>
    [...view.dom.querySelectorAll(`.${className}`)].map((node) => node.textContent ?? "")

  it("draws its own marks where the other has none", () => {
    const view = both("teh fox was here")
    view.dispatch({ effects: grammar.set.of([{ from: 8, to: 11 }]) })

    expect(drawn(view, "cm-yields")).toEqual(["was"])
  })

  it("gives up a word the other has already marked", () => {
    const view = both("teh fox was here")
    view.dispatch({
      effects: [
        spelling.set.of([{ from: 0, to: 3 }]),
        grammar.set.of([
          { from: 0, to: 3 },
          { from: 8, to: 11 }
        ])
      ]
    })

    expect(drawn(view, "cm-owner")).toEqual(["teh"])
    expect(drawn(view, "cm-yields")).toEqual(["was"])
  })

  it("gives up a word the other only overlaps", () => {
    const view = both("teh fox was here")
    view.dispatch({
      effects: [spelling.set.of([{ from: 1, to: 2 }]), grammar.set.of([{ from: 0, to: 3 }])]
    })

    expect(drawn(view, "cm-yields")).toEqual([])
  })

  /* Sharing an edge is not overlapping: the next word along is still its own. */
  it("keeps a mark that only begins where the other's ends", () => {
    const view = both("teh fox was here")
    view.dispatch({
      effects: [spelling.set.of([{ from: 0, to: 3 }]), grammar.set.of([{ from: 3, to: 7 }])]
    })

    expect(drawn(view, "cm-yields")).toEqual([" fox"])
  })

  it("takes the word back when the other stops marking it", () => {
    const view = both("teh fox was here")
    view.dispatch({
      effects: [spelling.set.of([{ from: 0, to: 3 }]), grammar.set.of([{ from: 0, to: 3 }])]
    })
    expect(drawn(view, "cm-yields")).toEqual([])

    view.dispatch({ effects: spelling.set.of([]) })
    expect(drawn(view, "cm-yields")).toEqual(["teh"])
  })
})

describe("an underline layer", () => {
  it("draws what the checker found", () => {
    const view = editor("teh quick bwron fox")
    view.dispatch({ effects: layer.set.of([{ from: 0, to: 3 }, { from: 10, to: 15 }]) })

    expect(marks(view)).toEqual(["teh", "bwron"])
  })

  /*
   * The reason this exists at all. The webview only marks a word as it is
   * typed, so a note written yesterday opened with nothing underlined in it.
   */
  it("checks a note as soon as it opens, not only once it is edited", () => {
    const asked = vi.fn()
    editor("teh quick bwron fox", asked)

    expect(asked).toHaveBeenCalledWith("teh quick bwron fox")
  })

  it("waits for the typing to stop before asking again", () => {
    const asked = vi.fn()
    const view = editor("teh", asked)
    asked.mockClear()

    view.dispatch({ changes: { from: 3, insert: " q" } })
    view.dispatch({ changes: { from: 5, insert: "u" } })
    expect(asked).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(asked).toHaveBeenCalledTimes(1)
    expect(asked).toHaveBeenCalledWith("teh qu")
  })

  /*
   * An underline stays under its own words while the reader carries on typing
   * somewhere else, rather than flickering off and back on the next pass.
   */
  it("keeps a mark under its word when text is inserted before it", () => {
    const view = editor("teh fox")
    view.dispatch({ effects: layer.set.of([{ from: 4, to: 7 }]) })
    expect(marks(view)).toEqual(["fox"])

    view.dispatch({ changes: { from: 0, insert: "the " } })
    expect(marks(view)).toEqual(["fox"])
  })

  it("drops a mark the reader has typed inside, rather than underlining the wrong words", () => {
    const view = editor("bwron fox")
    view.dispatch({ effects: layer.set.of([{ from: 0, to: 5 }]) })

    view.dispatch({ changes: { from: 2, insert: "o" } })
    expect(marks(view)).toEqual([])
  })

  it("finds the span under a position, and nothing outside one", () => {
    const spans = [{ from: 4, to: 9 }]

    expect(layer.at(spans, 6)).toEqual(spans[0])
    expect(layer.at(spans, 4)).toEqual(spans[0])
    expect(layer.at(spans, 2)).toBeNull()
    expect(layer.at([], 6)).toBeNull()
  })

  it("draws nothing for a span that has fallen off the end of the document", () => {
    const view = editor("teh")
    view.dispatch({ effects: layer.set.of([{ from: 0, to: 99 }]) })

    expect(marks(view)).toEqual([])
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { GrammarMenu } from "./GrammarMenu"
import { grammarChecking, setGrammarNotes, type GrammarNote } from "./grammar"

/*
 * Right-clicking a grammar underline.
 *
 * `noteAt` was written for this menu and then went unused for long enough to
 * grow tests of its own: the underline said a sentence was wrong and would not
 * say how, and right-clicking it did nothing.
 */
const article: GrammarNote = {
  from: 0,
  to: 1,
  message: "Incorrect indefinite article.",
  kind: "Agreement",
  suggestions: ["an"]
}

const misspelt: GrammarNote = {
  from: 2,
  to: 7,
  message: "Did you mean to spell `apple` this way?",
  kind: "Spelling",
  suggestions: ["apple"]
}

function editor(notes: GrammarNote[], withGrammar = true) {
  const view = new EditorView({
    state: EditorState.create({
      doc: "a apple",
      extensions: withGrammar ? [grammarChecking(() => undefined)] : []
    })
  })
  if (withGrammar) view.dispatch({ effects: setGrammarNotes.of(notes) })

  const ref = createRef<EditorView | null>() as { current: EditorView | null }
  ref.current = view
  document.body.append(view.dom)
  return { view, ref }
}

/*
 * Asked for by role rather than by text: the editor's own document is on the
 * page too, and `a apple` is exactly the text these menus are about.
 */
const row = (name: string) => screen.queryByRole("menuitem", { name })

/** jsdom has no layout, so the editor cannot place a click on its own. */
function rightClickAt(view: EditorView, position: number): void {
  vi.spyOn(view, "posAtCoords").mockReturnValue(position)
  act(() => {
    view.dom.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  })
}

describe("the grammar menu", () => {
  beforeEach(() => cleanup())

  it("says what the checker meant", () => {
    const { view, ref } = editor([article])
    render(<GrammarMenu viewRef={ref} />)

    rightClickAt(view, 0)
    expect(row("Incorrect indefinite article.")).toBeTruthy()
  })

  it("puts the suggestion into the document when it is chosen", async () => {
    const { view, ref } = editor([article])
    render(<GrammarMenu viewRef={ref} />)

    rightClickAt(view, 0)
    await userEvent.click(screen.getByRole("menuitem", { name: "an" }))

    expect(view.state.doc.toString()).toBe("an apple")
  })

  /*
   * The system's spelling menu knows the words the reader has added and can
   * add another, so those clicks are left to it. Answering them here as well
   * would open two menus on one right-click, which is the bug next door.
   */
  it("leaves a misspelt word to the spelling menu", () => {
    const { view, ref } = editor([misspelt])
    render(<GrammarMenu viewRef={ref} />)

    rightClickAt(view, 4)
    expect(row(misspelt.message)).toBeNull()
  })

  it("says nothing where there is no note", () => {
    const { view, ref } = editor([article])
    render(<GrammarMenu viewRef={ref} />)

    rightClickAt(view, 5)
    expect(row(article.message)).toBeNull()
  })

  /*
   * Grammar is a preference, and with it off the field is not in the editor's
   * state at all — asking for it throws. Caught from the window rather than
   * around the dispatch: an exception in an event listener never reaches the
   * code that fired the event, so wrapping the click in `expect().not
   * .toThrow()` passes whatever happens. It did.
   */
  it("does not throw when grammar is turned off", () => {
    const thrown: string[] = []
    const noteError = (event: ErrorEvent) => thrown.push(event.message)
    window.addEventListener("error", noteError)

    const { view, ref } = editor([], false)
    render(<GrammarMenu viewRef={ref} />)
    rightClickAt(view, 0)

    window.removeEventListener("error", noteError)
    expect(thrown).toEqual([])
  })

  it("offers no suggestions when the checker had none", () => {
    const { view, ref } = editor([{ ...article, suggestions: [] }])
    render(<GrammarMenu viewRef={ref} />)

    rightClickAt(view, 0)
    expect(row(article.message)).toBeTruthy()
    expect(row("an")).toBeNull()
  })
})

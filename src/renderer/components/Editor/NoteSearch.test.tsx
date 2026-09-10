import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { NoteSearch } from "./NoteSearch"
import { searchHighlighting } from "./searchHighlight"

let view: EditorView | null = null

function mount(doc: string, onClose = vi.fn()) {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [searchHighlighting()] }),
    parent: document.body
  })
  render(<NoteSearch viewRef={{ current: view }} openSeq={1} onClose={onClose} />)
  return { onClose, user: userEvent.setup() }
}

afterEach(() => {
  cleanup()
  view?.destroy()
  view = null
})

const field = () => screen.getByLabelText("Find in note")
const hits = () => document.querySelectorAll(".cm-search-hit").length

describe("finding in a note", () => {
  it("says nothing until there is a query", () => {
    // Not a text match: "coffee" contains "of", and the note's own words are
    // in the document beside the bar.
    mount("coffee and more coffee")
    expect(document.querySelector(".note-search-count")).toBeNull()
  })

  it("counts the matches and marks them", async () => {
    const { user } = mount("coffee and more coffee")
    await user.type(field(), "coffee")

    expect(screen.getByText("1 of 2")).toBeDefined()
    expect(hits()).toBe(2)
  })

  it("says None rather than leaving the reader to notice an absence", async () => {
    const { user } = mount("coffee")
    await user.type(field(), "tea")

    expect(screen.getByText("None")).toBeDefined()
    expect(hits()).toBe(0)
  })

  it("steps on Enter and wraps at the end", async () => {
    const { user } = mount("coffee and more coffee")
    await user.type(field(), "coffee")

    await user.type(field(), "{Enter}")
    expect(screen.getByText("2 of 2")).toBeDefined()

    await user.type(field(), "{Enter}")
    expect(screen.getByText("1 of 2")).toBeDefined()
  })

  it("steps backwards on Shift+Enter", async () => {
    const { user } = mount("coffee and more coffee")
    await user.type(field(), "coffee")

    await user.type(field(), "{Shift>}{Enter}{/Shift}")
    expect(screen.getByText("2 of 2")).toBeDefined()
  })

  it("closes on Escape", async () => {
    const { user, onClose } = mount("coffee")
    await user.type(field(), "{Escape}")

    expect(onClose).toHaveBeenCalled()
  })

  it("closes on the same key that opened it", async () => {
    // Focus is in the field while the bar is up, so the editor's own binding
    // never sees the second Cmd+F.
    const { user, onClose } = mount("coffee")
    await user.type(field(), "{Meta>}f{/Meta}")

    expect(onClose).toHaveBeenCalled()
  })

  it("marks exactly one match as the one being stood on", async () => {
    const { user } = mount("coffee and more coffee")
    await user.type(field(), "coffee")

    expect(document.querySelectorAll(".cm-search-hit-current")).toHaveLength(1)
  })
})

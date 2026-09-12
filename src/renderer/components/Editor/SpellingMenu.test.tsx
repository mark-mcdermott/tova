import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SpellingMenu } from "./SpellingMenu"
import { stubBridge } from "../../testing/bridge"
import { Misspelling } from "../../../shared/types"

const replace = vi.fn()
const addWord = vi.fn()
let emit: ((misspelling: Misspelling) => void) | null = null

const misspelling: Misspelling = {
  word: "teh",
  suggestions: ["the", "ten", "tea"],
  x: 120,
  y: 240
}

beforeEach(() => {
  vi.clearAllMocks()
  emit = null
  window.tova = stubBridge({
    spellcheck: {
      replace,
      addWord,
      onSuggest: vi.fn((listener: (m: Misspelling) => void) => {
        emit = listener
        return () => {
          emit = null
        }
      })
    }
  })
})

afterEach(cleanup)

describe("SpellingMenu", () => {
  /*
   * A word added to the dictionary is not a misspelling any more, and its
   * underline is Tova's to remove — so the editor is told to check again
   * rather than leaving the mark until the reader's next keystroke.
   */
  let rechecked: () => void
  beforeEach(() => {
    rechecked = vi.fn<() => void>()
  })

  it("shows nothing until a right-click lands on a misspelling", () => {
    const { container } = render(<SpellingMenu onDictionaryChange={rechecked} />)
    expect(container.textContent).toBe("")
  })

  it("offers the suggestions for the word that was clicked", () => {
    render(<SpellingMenu onDictionaryChange={rechecked} />)
    act(() => emit?.(misspelling))

    expect(screen.getByRole("menuitem", { name: "the" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "ten" })).toBeDefined()
  })

  it("replaces through Chromium, which owns the range that was clicked", async () => {
    render(<SpellingMenu onDictionaryChange={rechecked} />)
    act(() => emit?.(misspelling))

    await userEvent.click(screen.getByRole("menuitem", { name: "the" }))
    expect(replace).toHaveBeenCalledWith("the")
  })

  it("has the editor check again once a word is added, so its underline goes", async () => {
    render(<SpellingMenu onDictionaryChange={rechecked} />)
    act(() => emit?.(misspelling))

    await userEvent.click(screen.getByRole("menuitem", { name: /Add .* to dictionary/ }))
    expect(rechecked).toHaveBeenCalled()
  })

  it("can add the word to the dictionary instead", async () => {
    render(<SpellingMenu onDictionaryChange={rechecked} />)
    act(() => emit?.(misspelling))

    await userEvent.click(screen.getByRole("menuitem", { name: /Add .* to dictionary/ }))
    expect(addWord).toHaveBeenCalledWith("teh")
  })

  it("still offers the dictionary when there is nothing to suggest", () => {
    render(<SpellingMenu onDictionaryChange={rechecked} />)
    act(() => emit?.({ ...misspelling, suggestions: [] }))

    expect(screen.getByRole("menuitem", { name: "No suggestions" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: /Add .* to dictionary/ })).toBeDefined()
  })

  it("does not flood the menu with every suggestion Chromium has", () => {
    render(<SpellingMenu onDictionaryChange={rechecked} />)
    act(() => emit?.({ ...misspelling, suggestions: ["a", "b", "c", "d", "e", "f", "g", "h"] }))

    // Six corrections, then the separator and the dictionary entry.
    expect(screen.getAllByRole("menuitem")).toHaveLength(7)
  })
})

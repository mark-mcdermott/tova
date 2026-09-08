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
  it("shows nothing until a right-click lands on a misspelling", () => {
    const { container } = render(<SpellingMenu />)
    expect(container.textContent).toBe("")
  })

  it("offers the suggestions for the word that was clicked", () => {
    render(<SpellingMenu />)
    act(() => emit?.(misspelling))

    expect(screen.getByRole("menuitem", { name: "the" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "ten" })).toBeDefined()
  })

  it("replaces through Chromium, which owns the range that was clicked", async () => {
    render(<SpellingMenu />)
    act(() => emit?.(misspelling))

    await userEvent.click(screen.getByRole("menuitem", { name: "the" }))
    expect(replace).toHaveBeenCalledWith("the")
  })

  it("can add the word to the dictionary instead", async () => {
    render(<SpellingMenu />)
    act(() => emit?.(misspelling))

    await userEvent.click(screen.getByRole("menuitem", { name: /Add .* to dictionary/ }))
    expect(addWord).toHaveBeenCalledWith("teh")
  })

  it("still offers the dictionary when there is nothing to suggest", () => {
    render(<SpellingMenu />)
    act(() => emit?.({ ...misspelling, suggestions: [] }))

    expect(screen.getByRole("menuitem", { name: "No suggestions" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: /Add .* to dictionary/ })).toBeDefined()
  })

  it("does not flood the menu with every suggestion Chromium has", () => {
    render(<SpellingMenu />)
    act(() => emit?.({ ...misspelling, suggestions: ["a", "b", "c", "d", "e", "f", "g", "h"] }))

    // Six corrections, then the separator and the dictionary entry.
    expect(screen.getAllByRole("menuitem")).toHaveLength(7)
  })
})

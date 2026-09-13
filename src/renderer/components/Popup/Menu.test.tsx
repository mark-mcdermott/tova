import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Menu } from "./Menu"

/*
 * Where the keyboard goes when a menu opens.
 *
 * A menu raised by a right-click should take it: the pointer is the way in and
 * the keyboard should follow. A menu offered *while the reader is typing* must
 * not, or the next keystroke lands on a button instead of the document — which
 * is what made backspacing an `@` away appear to do nothing at all.
 */
function typing(): HTMLInputElement {
  const editor = document.createElement("input")
  document.body.append(editor)
  editor.focus()
  return editor
}

const items = [{ label: "A blog", onSelect: () => undefined }]

afterEach(cleanup)

describe("a menu and the keyboard", () => {
  it("takes focus by default, the way a context menu should", () => {
    typing()
    render(<Menu x={0} y={0} items={items} onClose={() => undefined} />)

    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "A blog" }))
  })

  it("leaves the caret alone when it is offered mid-sentence", () => {
    const editor = typing()
    render(<Menu x={0} y={0} items={items} takesFocus={false} onClose={() => undefined} />)

    expect(document.activeElement).toBe(editor)
  })

  it("is still there to be clicked either way", () => {
    render(<Menu x={0} y={0} items={items} takesFocus={false} onClose={() => undefined} />)

    expect(screen.getByRole("menuitem", { name: "A blog" })).toBeDefined()
  })
})

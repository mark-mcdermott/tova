import { describe, it, expect, afterEach } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { applyFormat, formatKeymap, toolbarButtons, toolbarItems } from "./formats"

const list = { kind: "linePrefix" as const, prefix: "- " }

let view: EditorView | null = null

function mount(doc: string, anchor: number, head = anchor) {
  view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
    parent: document.body
  })
  return view
}

/** The document with a | where the caret sits. */
function withCaret(view: EditorView): string {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc.toString()
  return from === to
    ? `${doc.slice(0, from)}|${doc.slice(from)}`
    : `${doc.slice(0, from)}[${doc.slice(from, to)}]${doc.slice(to)}`
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("the list button", () => {
  it("leaves the caret past the bullet on a blank line", () => {
    // Rewriting the whole line used to map the caret back to its start, so the
    // bullet appeared and there was nowhere useful to type.
    const view = mount("", 0)
    applyFormat(view, list)

    expect(withCaret(view)).toBe("- |")
  })

  it("carries the caret along on a line that already has words", () => {
    const view = mount("Coffee.", 7)
    applyFormat(view, list)

    expect(withCaret(view)).toBe("- Coffee.|")
  })

  it("takes the bullet off again, bringing the caret back with it", () => {
    const view = mount("- Coffee.", 9)
    applyFormat(view, list)

    expect(withCaret(view)).toBe("Coffee.|")
  })

  it("keeps the caret inside the words it started in", () => {
    const view = mount("Coffee.", 3)
    applyFormat(view, list)

    expect(withCaret(view)).toBe("- Cof|fee.")
  })

  it("bullets every line a selection touches", () => {
    const view = mount("One\nTwo\nThree", 0, 13)
    applyFormat(view, list)

    expect(view.state.doc.toString()).toBe("- One\n- Two\n- Three")
  })

  it("keeps the indent in front of the bullet", () => {
    const view = mount("    Coffee.", 11)
    applyFormat(view, list)

    expect(withCaret(view)).toBe("    - Coffee.|")
  })

  it("swaps one marker for another rather than stacking them", () => {
    const view = mount("# Heading", 9)
    applyFormat(view, list)

    expect(withCaret(view)).toBe("- Heading|")
  })
})

const plain = { kind: "linePrefix" as const, prefix: "" }

describe("the plain button", () => {
  it("takes a heading back to prose", () => {
    const view = mount("# Heading", 9)
    applyFormat(view, plain)

    expect(withCaret(view)).toBe("Heading|")
  })

  it("takes a bullet back to prose", () => {
    const view = mount("- Coffee.", 9)
    applyFormat(view, plain)

    expect(withCaret(view)).toBe("Coffee.|")
  })

  it("takes a numbered item back to prose", () => {
    const view = mount("1. Coffee.", 10)
    applyFormat(view, plain)

    expect(withCaret(view)).toBe("Coffee.|")
  })

  it("leaves a line that is already plain exactly where it was", () => {
    const view = mount("Coffee.", 3)
    applyFormat(view, plain)

    expect(withCaret(view)).toBe("Cof|fee.")
  })
})

describe("what the toolbar draws", () => {
  it("leaves Plain out of the row", () => {
    // The row reads as a set of things to add; a control for taking one back
    // off sat oddly at the head of it.
    expect(toolbarButtons.some((item) => item.key === "plain")).toBe(false)
  })

  it("draws everything else, in the order it is listed", () => {
    expect(toolbarButtons.map((item) => item.key)).toEqual(
      toolbarItems.filter((item) => item.key !== "plain").map((item) => item.key)
    )
  })

  it("still binds Plain to its shortcut, which is the 0 of the headings' 0/1/2", () => {
    expect(formatKeymap.some((binding) => binding.key === "Mod-Shift-0")).toBe(true)
  })

  it("binds every format, drawn or not", () => {
    expect(formatKeymap).toHaveLength(toolbarItems.length)
  })
})

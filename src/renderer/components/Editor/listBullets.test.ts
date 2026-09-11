import { describe, it, expect, afterEach } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { markdownDecorations } from "./markdownDecorations"

let view: EditorView | null = null

function mount(doc: string, anchor: number) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [markdown({ base: markdownLanguage }), markdownDecorations()]
    }),
    parent: document.body
  })
  return view
}

/**
 * How many of a given mark one line carries, counted on the real DOM. A count
 * rather than a lookup, so "no bullet here" cannot pass by finding nothing at
 * all somewhere else.
 */
function marksOn(view: EditorView, line: number, className: string): number {
  const row = view.dom.querySelectorAll(".cm-line")[line]
  return row.querySelectorAll(`.${className}`).length
}

/** What each line reads as on screen, bullets and all. */
function lines(view: EditorView): string[] {
  return [...view.dom.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "")
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("a bullet list", () => {
  const doc = "- one\n- two\n\nAfter.\n"

  it("wears a circle in place of the dash", () => {
    const view = mount(doc, doc.indexOf("After"))

    expect(marksOn(view, 0, "cm-list-bullet")).toBe(1)
    expect(marksOn(view, 1, "cm-list-bullet")).toBe(1)
  })

  it("gives the dash back, as a marker, when the cursor is on the line", () => {
    const view = mount(doc, doc.indexOf("one"))

    expect(marksOn(view, 0, "cm-list-bullet")).toBe(0)
    expect(marksOn(view, 0, "cm-syntax-marker")).toBe(1)
    // Only that line. The one below is still being read, not written.
    expect(marksOn(view, 1, "cm-list-bullet")).toBe(1)
  })

  it("keeps the dash in the line either way, so nothing shifts under the cursor", () => {
    // The whole reason the mark is painted rather than replaced: a hidden dash
    // takes its width with it, and the words move as the cursor arrives.
    const away = lines(mount(doc, doc.indexOf("After")))
    view?.destroy()
    const inside = lines(mount(doc, doc.indexOf("one")))

    expect(inside).toEqual(away)
    expect(away[0]).toBe("- one")
  })

  it("hangs the text clear of the mark", () => {
    const view = mount(doc, doc.indexOf("After"))

    expect(view.dom.querySelectorAll(".cm-line.cm-list-line")).toHaveLength(2)
  })

  it("draws stars and pluses the same way, they being the same list", () => {
    const stars = "* one\n\n+ two\n\nAfter.\n"
    const view = mount(stars, stars.indexOf("After"))

    expect(marksOn(view, 0, "cm-list-bullet")).toBe(1)
    expect(marksOn(view, 2, "cm-list-bullet")).toBe(1)
  })

  it("draws a nested item too", () => {
    const nested = "- one\n  - under\n\nAfter.\n"
    const view = mount(nested, nested.indexOf("After"))

    expect(marksOn(view, 1, "cm-list-bullet")).toBe(1)
    expect(lines(view)[1]).toBe("  - under")
  })
})

describe("what is not a bullet list", () => {
  it("leaves a numbered item its number", () => {
    // The number is what the reader wrote and what they will read back. Only
    // the dash is a mark standing in for something.
    const doc = "1. one\n2. two\n\nAfter.\n"
    const view = mount(doc, doc.indexOf("After"))

    expect(marksOn(view, 0, "cm-list-bullet")).toBe(0)
    expect(lines(view)[0]).toBe("1. one")
  })

  it("leaves a task item its box", () => {
    const doc = "- [ ] one\n\nAfter.\n"
    const view = mount(doc, doc.indexOf("After"))

    expect(marksOn(view, 0, "cm-list-bullet")).toBe(0)
    expect(lines(view)[0]).toBe("- [ ] one")
  })

  it("leaves a dash in the middle of a sentence alone", () => {
    const doc = "A pause - then more.\n\nAfter.\n"
    const view = mount(doc, doc.indexOf("After"))

    expect(marksOn(view, 0, "cm-list-bullet")).toBe(0)
    expect(marksOn(view, 0, "cm-list-line")).toBe(0)
  })
})

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

/** Text of the lines the editor is actually showing. */
function visibleLines(view: EditorView): string[] {
  return [...view.dom.querySelectorAll(".cm-line")]
    .filter((line) => !line.classList.contains("cm-line-hidden"))
    .map((line) => line.textContent ?? "")
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("the tags line at the top of a note", () => {
  const doc = "#thoughts\n\nCoffee, foggy streets.\n"

  it("is hidden, since the tag row above already shows it", () => {
    const view = mount(doc, doc.indexOf("Coffee"))
    expect(visibleLines(view)).toEqual(["Coffee, foggy streets.", ""])
  })

  it("comes back when the cursor is on it, so a tag can be taken off", () => {
    const view = mount(doc, 2)
    expect(visibleLines(view)[0]).toBe("#thoughts")
  })

  it("stays hidden when the cursor sits at the very start of the prose", () => {
    // The prose's first character is outside the span, or writing the first
    // word of a note would flash the tags back.
    const view = mount(doc, doc.indexOf("Coffee"))
    expect(visibleLines(view)[0]).toBe("Coffee, foggy streets.")
  })

  it("leaves a tags line further down the note alone", () => {
    const later = "Coffee.\n\n#thoughts\n\nMore.\n"
    const view = mount(later, 0)
    expect(visibleLines(view)).toContain("#thoughts")
  })

  it("leaves a note that opens with prose alone", () => {
    const prose = "Coffee. #later\n\nMore.\n"
    const view = mount(prose, prose.length)
    // The hash goes, as it does for any tag written into a sentence, but the
    // line itself stays: only a tags-only opening line is the row's business.
    expect(visibleLines(view)[0]).toBe("Coffee. later")
  })

  it("keeps the tags on screen when they are the whole note", () => {
    const view = mount("#thoughts", 9)
    expect(visibleLines(view)).toEqual(["#thoughts"])
  })
})

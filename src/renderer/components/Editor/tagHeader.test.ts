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

  it("stays on screen, drawn like any other row of tags", () => {
    // It used to be hidden, on the grounds that the tag row above already
    // showed it. That made the first line of a note vanish as the cursor left
    // it, which is a surprising thing for an editor to do to your text.
    const view = mount(doc, doc.indexOf("Coffee"))
    expect(visibleLines(view)).toEqual(["#thoughts", "", "Coffee, foggy streets.", ""])
  })

  it("does not move when the cursor enters or leaves it", () => {
    const away = visibleLines(mount(doc, doc.indexOf("Coffee")))
    view?.destroy()
    const inside = visibleLines(mount(doc, 2))

    expect(inside).toEqual(away)
  })

  it("leaves a tags line further down the note alone, as before", () => {
    const later = "Coffee.\n\n#thoughts\n\nMore.\n"
    const view = mount(later, 0)
    expect(visibleLines(view)).toContain("#thoughts")
  })

  it("still strips the hash from a tag written into a sentence", () => {
    const prose = "Coffee. #later\n\nMore.\n"
    const view = mount(prose, prose.length)
    expect(visibleLines(view)[0]).toBe("Coffee. later")
  })

  it("keeps the tags on screen when they are the whole note", () => {
    const view = mount("#thoughts", 9)
    expect(visibleLines(view)).toEqual(["#thoughts"])
  })
})

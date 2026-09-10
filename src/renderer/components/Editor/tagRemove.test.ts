import { describe, it, expect, afterEach } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { markdownDecorations } from "./markdownDecorations"

let view: EditorView | null = null

function mount(doc: string, anchor = doc.length) {
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

const controls = (view: EditorView) => [
  ...view.dom.querySelectorAll<HTMLButtonElement>(".cm-tag-remove")
]

/** The editor takes the selection on mousedown, which is what the widget listens for. */
function press(button: HTMLButtonElement) {
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("removing a tag from the prose", () => {
  it("puts a control on each rendered tag", () => {
    const view = mount("#a #b\n\nProse.")
    expect(controls(view).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove a",
      "Remove b"
    ])
  })

  it("takes the word off a line of nothing but tags", () => {
    const view = mount("#a #b\n\nProse.")
    press(controls(view)[0])

    expect(view.state.doc.toString()).toBe("#b\n\nProse.")
  })

  it("strips only the hash from a tag inside a sentence", () => {
    const view = mount("I love #thoughts about coffee.", 0)
    press(controls(view)[0])

    expect(view.state.doc.toString()).toBe("I love thoughts about coffee.")
  })

  it("removes the line and the gap under it when nothing is left on it", () => {
    const view = mount("#work\n\nProse.")
    press(controls(view)[0])

    expect(view.state.doc.toString()).toBe("Prose.")
  })

  it("takes one use and leaves the others, so the note keeps the tag", () => {
    // Which is why the chip stays in the row above: the note still carries it.
    const view = mount("A #work note about #work.", 0)
    press(controls(view)[0])

    expect(view.state.doc.toString()).toBe("A work note about #work.")
  })

  it("removes the use that was clicked, not the first one", () => {
    const view = mount("A #work note about #work.", 0)
    press(controls(view)[1])

    expect(view.state.doc.toString()).toBe("A #work note about work.")
  })

  it("offers no control on a tag the cursor is inside", () => {
    // There the tag is raw text and the writer is editing it themselves.
    const doc = "I love #thoughts about coffee."
    const view = mount(doc, doc.indexOf("#thoughts") + 2)

    expect(controls(view)).toHaveLength(0)
  })

  it("leaves a hash that is not a tag alone", () => {
    const view = mount("# Heading\n\nProse about #1 and code.")
    expect(controls(view)).toHaveLength(0)
  })
})

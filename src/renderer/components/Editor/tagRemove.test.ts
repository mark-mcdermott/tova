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

describe("the control's styling hooks", () => {
  it("says which pill it belongs to, rather than leaving it to the DOM", () => {
    // CodeMirror puts a cm-widgetBuffer between a mark and the widget after it,
    // so the × is not the pill's next sibling and `+` alone never matched. The
    // class is what carries the prose-versus-tags-line difference.
    const view = mount("#top\n\nProse with #body in it.", 0)
    const classes = controls(view).map((button) => button.className)

    expect(classes).toEqual(["cm-tag-remove is-top", "cm-tag-remove is-body"])
  })

  it("is reachable from the pill by the rule that reveals it", () => {
    // The reveal does still need the relationship, so this holds the selector
    // to the shape CodeMirror actually builds.
    const view = mount("Prose with #body in it.", 0)
    const [button] = controls(view)

    expect(
      button.matches(".cm-tag + .cm-tag-remove, .cm-tag + .cm-widgetBuffer + .cm-tag-remove")
    ).toBe(true)
  })
})

describe("opening a tag from the prose", () => {
  function mountWith(doc: string, anchor: number, onOpenTag: (tag: string) => void) {
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor },
        extensions: [markdown({ base: markdownLanguage }), markdownDecorations({ onOpenTag })]
      }),
      parent: document.body
    })
    return view
  }

  const clickOn = (element: Element) =>
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
    )

  it("opens the tag's listing when its pill is clicked", () => {
    const opened: string[] = []
    const view = mountWith("Coffee and #streets today.", 0, (tag) => opened.push(tag))

    clickOn(view.dom.querySelector(".cm-tag-body") as Element)
    expect(opened).toEqual(["streets"])
  })

  it("opens the right one when a line carries several", () => {
    const opened: string[] = []
    const doc = "#one #two\n\nProse."
    const view = mountWith(doc, doc.length, (tag) => opened.push(tag))

    clickOn(view.dom.querySelectorAll(".cm-tag-top")[1])
    expect(opened).toEqual(["two"])
  })

  it("leaves a tag the caret is inside alone", () => {
    // There it is raw text the writer is editing, and clicking around in it
    // has to keep working.
    const doc = "Coffee and #streets today."
    const opened: string[] = []
    const view = mountWith(doc, doc.indexOf("#streets") + 3, (tag) => opened.push(tag))

    const raw = view.dom.querySelector(".cm-tag-raw")
    if (raw !== null) clickOn(raw)
    expect(opened).toEqual([])
  })

  it("ignores a click on ordinary prose", () => {
    const opened: string[] = []
    const view = mountWith("Coffee and streets today.", 0, (tag) => opened.push(tag))

    clickOn(view.dom.querySelector(".cm-line") as Element)
    expect(opened).toEqual([])
  })
})

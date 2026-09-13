import { describe, it, expect, afterEach } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { markdownDecorations } from "./markdownDecorations"

/*
 * `Text` with `---` under it is a heading in Markdown, not a rule — the
 * dashes underline the line above. Nothing drew one, so the line stayed
 * ordinary prose and the dashes sat there looking like a rule that had failed
 * to render, which is how it was reported.
 *
 * A rule needs a blank line above it. These pin both readings.
 */
let view: EditorView | null = null

function mount(doc: string) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [markdown({ base: markdownLanguage }), markdownDecorations()]
    }),
    parent: document.body
  })
  return view
}

const has = (view: EditorView, className: string): number =>
  view.dom.querySelectorAll(`.${className}`).length

afterEach(() => {
  view?.destroy()
  view = null
})

describe("dashes under a line of text", () => {
  it("draw it as a heading rather than leaving it as prose", () => {
    const view = mount("Chapter One\n---\n\nProse.\n")

    expect(has(view, "cm-h2")).toBe(1)
  })

  it("uses the level the underline asks for", () => {
    expect(has(mount("Title\n===\n\nProse.\n"), "cm-h1")).toBe(1)
  })

  /* The heading is the words, not the dashes. */
  it("styles the words and not the underline", () => {
    const view = mount("Chapter One\n---\n")
    const heading = view.dom.querySelector(".cm-h2")

    expect(heading?.textContent).toBe("Chapter One")
  })

  /* And the reading that was wanted: a blank line makes it a rule. */
  it("is a rule instead when a blank line comes first", () => {
    const view = mount("Prose.\n\n---\n\nMore.\n")

    expect(has(view, "cm-rule-line")).toBe(1)
    expect(has(view, "cm-h2")).toBe(0)
  })

  it("is a rule at the very start of a note", () => {
    expect(has(mount("---\n\nProse.\n"), "cm-rule-line")).toBe(1)
  })
})

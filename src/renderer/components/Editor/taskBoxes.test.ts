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

/** How many of a mark one line carries, counted on the real DOM. */
function marksOn(view: EditorView, line: number, className: string): number {
  const row = view.dom.querySelectorAll(".cm-line")[line]
  return row.querySelectorAll(`.${className}`).length
}

function box(view: EditorView, line: number): HTMLElement | null {
  const row = view.dom.querySelectorAll(".cm-line")[line]
  return row.querySelector(".cm-task-box")
}

/** A left-button mousedown, which is what the handler listens for. */
function clickBox(target: HTMLElement): void {
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }))
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("a task list", () => {
  const doc = "- [ ] milk\n- [x] bread\n\nAfter.\n"

  it("wears a box in place of the brackets", () => {
    const view = mount(doc, doc.indexOf("After"))

    expect(marksOn(view, 0, "cm-task-box")).toBe(1)
    expect(marksOn(view, 1, "cm-task-box")).toBe(1)
  })

  it("says which boxes are ticked", () => {
    const view = mount(doc, doc.indexOf("After"))

    expect(box(view, 0)?.classList.contains("is-done")).toBe(false)
    expect(box(view, 1)?.classList.contains("is-done")).toBe(true)
  })

  /*
   * The whole point of a mark over a replacement: `[ ]` keeps its three cells
   * and gives up only its ink, so bringing the cursor back moves nothing. A
   * widget would reflow the line under the caret as it arrived.
   */
  it("keeps the brackets in the text so nothing reflows", () => {
    const view = mount(doc, doc.indexOf("After"))
    const row = view.dom.querySelectorAll(".cm-line")[0]

    expect(row.textContent).toBe("- [ ] milk")
  })

  it("hands the brackets back when the cursor is on the line", () => {
    const view = mount(doc, 2)

    expect(marksOn(view, 0, "cm-task-box")).toBe(0)
    expect(marksOn(view, 0, "cm-syntax-marker")).toBeGreaterThan(0)
    // The line below is untouched by this cursor, and still wears its box.
    expect(marksOn(view, 1, "cm-task-box")).toBe(1)
  })

  /*
   * The indent belongs to the line, not to the box, so it survives the cursor
   * arriving. If it were pushed only on the rendered branch the whole line
   * would jump left as the caret landed on it — the reflow the mark decoration
   * exists to avoid, reintroduced one level up.
   */
  it("keeps its indent when the brackets come back", () => {
    const view = mount(doc, 2)
    const row = view.dom.querySelectorAll(".cm-line")[0]

    expect(row.classList.contains("cm-task-line")).toBe(true)
  })

  it("leaves a plain bullet to the bullet rule", () => {
    const plain = "- milk\n\nAfter.\n"
    const view = mount(plain, plain.indexOf("After"))

    expect(marksOn(view, 0, "cm-task-box")).toBe(0)
    expect(marksOn(view, 0, "cm-list-bullet")).toBe(1)
  })

  /*
   * `[x]` is a link to lezer's CommonMark parser, which is the tree the editor
   * had before `base: markdownLanguage` turned GFM on. A task that parsed as a
   * link would decorate as one, so this pins the base as much as the rule.
   */
  it("is a task and not a link", () => {
    const view = mount(doc, doc.indexOf("After"))

    expect(marksOn(view, 1, "cm-link")).toBe(0)
  })
})

describe("ticking a box", () => {
  const doc = "- [ ] milk\n- [x] bread\n\nAfter.\n"

  it("ticks an empty one", () => {
    const view = mount(doc, doc.indexOf("After"))

    clickBox(box(view, 0)!)

    expect(view.state.doc.line(1).text).toBe("- [x] milk")
  })

  it("unticks a full one", () => {
    const view = mount(doc, doc.indexOf("After"))

    clickBox(box(view, 1)!)

    expect(view.state.doc.line(2).text).toBe("- [ ] bread")
  })

  it("ticks the one that was clicked and no other", () => {
    const view = mount(doc, doc.indexOf("After"))

    clickBox(box(view, 0)!)

    expect(view.state.doc.line(2).text).toBe("- [x] bread")
  })

  it("ignores a mousedown that missed a box", () => {
    const view = mount(doc, doc.indexOf("After"))
    const words = view.dom.querySelectorAll(".cm-line")[2] as HTMLElement

    clickBox(words)

    expect(view.state.doc.toString()).toBe(doc)
  })

  /*
   * NOT COVERED, deliberately: that the handler calls `preventDefault`.
   *
   * It matters — the box is drawn over text the caret can sit in, and without
   * it the editor takes the selection from the same mousedown and lands the
   * caret between the brackets it just toggled, handing back the raw `[x]` so
   * the box vanishes under the pointer that asked for it.
   *
   * There is no honest assertion for it here. jsdom does not move the caret on
   * a synthetic mousedown, so checking the selection passes either way; and
   * CodeMirror calls `preventDefault` on mousedown for its own selection
   * handling, so `event.defaultPrevented` is true whatever this handler does.
   * Two tests were written against each of those and both proved nothing —
   * removing the call left the suite green. Verified by hand instead.
   */

  it("keeps a box after the toggle, now ticked", () => {
    const view = mount(doc, doc.indexOf("After"))

    clickBox(box(view, 0)!)

    expect(box(view, 0)?.classList.contains("is-done")).toBe(true)
  })
})

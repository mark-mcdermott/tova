import { describe, it, expect, afterEach, vi } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { blogSelector, insertPostBlock } from "./blogSelector"

// CodeMirror measures the caret to place the popup, and jsdom lays nothing out.
// A flat stub is enough: the tests care about which position is offered, not
// where on screen it lands.
const rect = { left: 12, right: 12, top: 40, bottom: 56, width: 0, height: 16, x: 12, y: 40 }
Range.prototype.getClientRects = () =>
  ({
    length: 1,
    item: () => rect as DOMRect,
    0: rect,
    [Symbol.iterator]: function* () {
      yield rect as DOMRect
    }
  }) as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => rect as DOMRect

let view: EditorView | null = null

function mount(doc: string, onAnchor = vi.fn()) {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [blogSelector(onAnchor)] }),
    parent: document.body
  })
  return { view, onAnchor }
}

/** Types text at the cursor the way the extension will see it. */
function type(target: EditorView, text: string) {
  const at = target.state.selection.main.head
  target.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length } })
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("blogSelector", () => {
  it("offers the blogs when @ opens a line", () => {
    const { view, onAnchor } = mount("")
    type(view, "@")

    const anchor = onAnchor.mock.calls.at(-1)?.[0]
    expect(anchor).not.toBeNull()
    expect(anchor.from).toBe(0)
    expect(anchor.y).toBeGreaterThan(rect.bottom - 1)
  })

  it("stops offering once the @ is part of a word", () => {
    const { view, onAnchor } = mount("")
    type(view, "@")
    type(view, "mark")

    expect(onAnchor.mock.calls.at(-1)?.[0]).toBeNull()
  })

  it("ignores an @ that follows text, so an email address is left alone", () => {
    const { view, onAnchor } = mount("write to me")
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    type(view, "@")

    expect(onAnchor.mock.calls.at(-1)?.[0]).toBeNull()
  })

  it("closes when the selection is no longer a cursor", () => {
    const { view, onAnchor } = mount("")
    type(view, "@")
    view.dispatch({ selection: { anchor: 0, head: 1 } })

    expect(onAnchor.mock.calls.at(-1)?.[0]).toBeNull()
  })
})

describe("insertPostBlock", () => {
  it("replaces the @ with a block and leaves the cursor on the title", () => {
    const { view } = mount("@")
    insertPostBlock(view, 0, "markmcdermott.io", new Date(2026, 8, 7))

    expect(view.state.doc.toString()).toBe("@markmcdermott.io post\n@title \n@date 2026-09-07\n\n")
    expect(view.state.selection.main.head).toBe("@markmcdermott.io post\n@title ".length)
  })

  it("dates the block by the local calendar, not UTC", () => {
    const { view } = mount("@")
    // Late evening local: toISOString would roll this into the next day.
    insertPostBlock(view, 0, "a.com", new Date(2026, 8, 7, 23, 30))
    expect(view.state.doc.toString()).toContain("@date 2026-09-07")
  })
})

import { describe, it, expect, afterEach } from "vitest"
import { EditorView, keymap } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkupCommand,
  deleteMarkupBackward
} from "@codemirror/lang-markdown"
import { defaultKeymap, history, historyKeymap, undo } from "@codemirror/commands"
import { continueBullet } from "./listContinue"

let view: EditorView | null = null

/** The editor as the app wires it: this command ahead of the markdown keymap. */
function mount(doc: string, anchor: number) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [
        history(),
        markdown({ base: markdownLanguage, addKeymap: false }),
        keymap.of([
          { key: "Enter", run: continueBullet },
          { key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
          { key: "Backspace", run: deleteMarkupBackward },
          ...historyKeymap,
          ...defaultKeymap
        ])
      ]
    }),
    parent: document.body
  })
  return view
}

/** The document with a | where the caret sits, so both are read at once. */
function withCaret(view: EditorView): string {
  const at = view.state.selection.main.head
  const doc = view.state.doc.toString()
  return `${doc.slice(0, at)}|${doc.slice(at)}`
}

function pressEnter(view: EditorView): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  )
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("Enter at the end of a bullet", () => {
  it("starts the next one on the very next line", () => {
    const doc = "- one"
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(withCaret(view)).toBe("- one\n- |")
  })

  it("does the same in a list the blank lines have made loose", () => {
    // The markdown keymap would keep the gap here, CommonMark calling this a
    // loose list. This is the case that sent the note down the page.
    const doc = "- one\n\n- two"
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(withCaret(view)).toBe("- one\n\n- two\n- |")
  })

  it("carries the indent of a nested item", () => {
    const doc = "- one\n  - under"
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(withCaret(view)).toBe("- one\n  - under\n  - |")
  })

  it("keeps the marker the reader chose", () => {
    const doc = "* one"
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(withCaret(view)).toBe("* one\n* |")
  })

  it("is one step to undo", () => {
    // Two transactions would mean two presses of Cmd+Z to get back, which is
    // not what pressing Enter once looks like it did.
    const doc = "- one\n\n- two"
    const view = mount(doc, doc.length)
    pressEnter(view)
    undo(view)

    expect(view.state.doc.toString()).toBe(doc)
  })

  it("ends the list rather than spacing it out, twice pressed", () => {
    // How the gaps got into a note in the first place. Markdown's own Enter,
    // on an empty second item of a tight list, inserts a blank line above it
    // and makes the list loose — and from then on every Enter leaves a gap.
    const doc = "- one"
    const view = mount(doc, doc.length)
    pressEnter(view)
    pressEnter(view)

    expect(withCaret(view)).toBe("- one\n|")
  })
})

describe("Enter anywhere else", () => {
  it("ends the list from an empty item, as it always did", () => {
    const doc = "- one\n- "
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(view.state.doc.toString()).toBe("- one\n")
  })

  it("splits an item when the cursor is inside its words", () => {
    const doc = "- one two"
    const view = mount(doc, doc.indexOf(" two"))
    pressEnter(view)

    expect(withCaret(view)).toBe("- one\n- | two")
  })

  it("leaves a numbered list to the markdown keymap, which renumbers it", () => {
    const doc = "1. one"
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(withCaret(view)).toBe("1. one\n2. |")
  })

  it("leaves a dash inside a fenced block alone", () => {
    const doc = "```\n- not a list\n```"
    const view = mount(doc, doc.indexOf("\n```", 4))
    pressEnter(view)

    expect(withCaret(view)).toBe("```\n- not a list\n|\n```")
  })

  it("starts a plain new line under ordinary prose", () => {
    const doc = "Coffee."
    const view = mount(doc, doc.length)
    pressEnter(view)

    expect(withCaret(view)).toBe("Coffee.\n|")
  })
})

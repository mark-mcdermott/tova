import { describe, it, expect, afterEach } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { tableSupport } from "./tables"

let view: EditorView | null = null

const RAGGED = ["| Note | Words |", "| --- | --- |", "| Avalanche season | 1840 |", "", "After."]

/**
 * Counts the layout transactions, because the document cannot.
 *
 * A redundant dispatch writes the same text back, so asserting the document is
 * unchanged passes whether or not one happened — which it did, until this
 * counted instead.
 */
const layouts = { count: 0 }

function mount(lines: string[], anchor: number) {
  layouts.count = 0
  const doc = lines.join("\n")
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [
        markdown({ base: markdownLanguage }),
        tableSupport(),
        EditorView.updateListener.of((update) => {
          if (update.transactions.some((tr) => tr.isUserEvent("format.table"))) {
            layouts.count += 1
          }
        })
      ]
    }),
    parent: document.body
  })
  return view
}

/** Where in the document a piece of text starts. */
function at(lines: string[], text: string): number {
  return lines.join("\n").indexOf(text)
}

function rows(view: EditorView): Element[] {
  return [...view.dom.querySelectorAll(".cm-line")]
}

/** The document as lines, which is what alignment actually changes. */
function docLines(view: EditorView): string[] {
  return view.state.doc.toString().split("\n")
}

/** Lets the microtask the aligner defers to actually run. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("a table at rest", () => {
  it("dims its pipes", () => {
    const view = mount(RAGGED, at(RAGGED, "After."))

    expect(rows(view)[0].querySelectorAll(".cm-table-pipe").length).toBeGreaterThan(0)
  })

  it("leans on the header row", () => {
    const view = mount(RAGGED, at(RAGGED, "After."))

    expect(rows(view)[0].classList.contains("cm-table-head")).toBe(true)
    expect(rows(view)[2].classList.contains("cm-table-head")).toBe(false)
  })

  /*
   * Ink, not space. Hiding the line would move every row beneath it, which at
   * the prose line-height is a 42px jump into and out of every table.
   */
  it("wears a rule in place of its dashes, keeping its line", () => {
    const view = mount(RAGGED, at(RAGGED, "After."))

    expect(rows(view)[1].classList.contains("cm-table-rule")).toBe(true)
    expect(rows(view)[1].classList.contains("cm-line-hidden")).toBe(false)
    // The text is still there to be measured, so the table is as tall as ever
    // — ragged here, because mounting with the caret already outside never
    // crosses out of the table and so never lays it out.
    expect(rows(view)[1].textContent).toBe("| --- | --- |")
  })

  it("leaves a paragraph of pipes alone", () => {
    // No delimiter row, so it is not a table — and decorating it would make a
    // sentence with pipes in it look like one.
    const notATable = ["| not | a table |", "| still | not |", "", "After."]
    const view = mount(notATable, at(notATable, "After."))

    expect(rows(view)[0].classList.contains("cm-table-head")).toBe(false)
    expect(rows(view)[0].querySelectorAll(".cm-table-pipe")).toHaveLength(0)
  })
})

describe("a table with the caret in it", () => {
  /*
   * The whole table, not the delimiter line alone. Revealing it only while the
   * caret sat on that one line would make the table jump every time the caret
   * crossed it, which is most of the moving anyone does in a table.
   */
  it("hands the dashes back when the caret is on that row", () => {
    const view = mount(RAGGED, at(RAGGED, "---"))

    expect(rows(view)[1].classList.contains("cm-table-rule")).toBe(false)
  })

  /*
   * And not before. Changing ink moves nothing, so the reveal is per-line here
   * rather than per-table — the caret being two rows down is no reason to show
   * a row's markup.
   */
  it("keeps the rule while the caret is elsewhere in the table", () => {
    const view = mount(RAGGED, at(RAGGED, "Avalanche"))

    expect(rows(view)[1].classList.contains("cm-table-rule")).toBe(true)
  })

  it("draws the rule again once the caret leaves the row", () => {
    const view = mount(RAGGED, at(RAGGED, "---"))

    view.dispatch({ selection: { anchor: at(RAGGED, "After.") } })

    expect(rows(view)[1].classList.contains("cm-table-rule")).toBe(true)
  })
})

describe("laying a table out", () => {
  it("pads the cells when the caret leaves", async () => {
    const view = mount(RAGGED, at(RAGGED, "Avalanche"))

    view.dispatch({ selection: { anchor: at(RAGGED, "After.") } })
    await settle()

    expect(docLines(view).slice(0, 3)).toEqual([
      "| Note             | Words |",
      "| ---------------- | ----- |",
      "| Avalanche season | 1840  |"
    ])
  })

  /*
   * On leaving rather than on every keystroke: padding as you type would push
   * the rest of the row away from the caret mid-word.
   */
  it("leaves it ragged while the caret is still inside", async () => {
    const view = mount(RAGGED, at(RAGGED, "Note"))

    view.dispatch({ selection: { anchor: at(RAGGED, "Avalanche") } })
    await settle()

    expect(docLines(view)[0]).toBe("| Note | Words |")
  })

  it("writes nothing at all when the table is already laid out", async () => {
    const tidy = ["| a   | b   |", "| --- | --- |", "| 1   | 2   |", "", "After."]
    const view = mount(tidy, at(tidy, "1"))
    const before = view.state.doc.toString()

    view.dispatch({ selection: { anchor: at(tidy, "After.") } })
    await settle()

    expect(view.state.doc.toString()).toBe(before)
    // The document cannot see the difference — a redundant layout writes the
    // same text back — so the transaction is what gets counted. Without this
    // the test passed with the guard deleted, and every visit to a tidy table
    // would still have put a no-op step in the undo history.
    expect(layouts.count).toBe(0)
  })

  it("does not disturb what comes after it", async () => {
    const view = mount(RAGGED, at(RAGGED, "Avalanche"))

    view.dispatch({ selection: { anchor: at(RAGGED, "After.") } })
    await settle()

    expect(docLines(view).slice(3)).toEqual(["", "After."])
  })

  it("lays out a table typed from nothing", async () => {
    const typed = ["| a | b |", "| --- | --- |", "| longer | x |", "", "After."]
    const view = mount(typed, at(typed, "longer"))

    view.dispatch({ selection: { anchor: at(typed, "After.") } })
    await settle()

    expect(docLines(view)[0]).toBe("| a      | b   |")
  })
})

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { escapeHtml, markdownToHtml } from "../shared/markdownToHtml"
import { notePdfPage } from "../shared/notePdfPage"

/*
 * The other half of the fixture tests in src-tauri/src/markdown_html.rs.
 *
 * The inline rules are six regex replacements run one after another over the
 * whole string, and the order is load-bearing: `**bold**` becomes a tag before
 * the single-star rule ever sees it. The cases are the ones where that
 * matters, plus the ones where a pattern refuses to match.
 */
interface Fixture {
  escapeHtml: { text: string; escaped: string }[]
  markdownToHtml: { body: string; html: string }[]
  notePdfPage: { title: string; body: string; page: string }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/markdown.json", "utf-8"))

describe("the markdown conformance fixture", () => {
  it("says which characters are escaped", () => {
    for (const one of doc.escapeHtml) {
      expect(escapeHtml(one.text), JSON.stringify(one.text)).toBe(one.escaped)
    }
  })

  it("says what a note becomes", () => {
    for (const one of doc.markdownToHtml) {
      expect(markdownToHtml(one.body), JSON.stringify(one.body)).toBe(one.html)
    }
  })

  it("says what the printed page looks like", () => {
    for (const one of doc.notePdfPage) {
      expect(notePdfPage(one.title, one.body), JSON.stringify(one.title)).toBe(one.page)
    }
  })
})

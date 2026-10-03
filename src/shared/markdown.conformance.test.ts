// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { escapeHtml, markdownToHtml } from "./markdownToHtml"
import { notePdfPage } from "./notePdfPage"

/*
 * The other half of `conformance/markdown.json`.
 *
 * Its readme says "both read this" and only the Rust did. The hand-written
 * tests next door cover this side, which is not the same thing: a change here
 * that the fixture does not follow leaves the Rust passing against a stale
 * answer, and the two exports — the HTML button and the PDF — quietly disagree
 * about the same note.
 *
 * Found by tampering, the same way the preferences fixture was. Dropping the
 * alignment style, leaving an escaped pipe escaped, and emitting an empty
 * `<tbody>` each changed the answer for several cases, and every TypeScript
 * test still passed. All three fail here.
 *
 * Eight more fixtures in `conformance/` are read by the Rust alone.
 * `docs/ROADMAP.md` lists them.
 */
const fixture = JSON.parse(readFileSync("conformance/markdown.json", "utf-8")) as {
  escapeHtml: { text: string; escaped: string }[]
  markdownToHtml: { body: string; html: string }[]
  notePdfPage: { title: string; body: string; page: string }[]
}

describe("escapeHtml, against every case the Rust answers", () => {
  fixture.escapeHtml.forEach(({ text, escaped }) => {
    it(`${JSON.stringify(text)}`, () => {
      expect(escapeHtml(text)).toBe(escaped)
    })
  })
})

describe("markdownToHtml, against every case the Rust answers", () => {
  it("has enough of them to be worth reading", () => {
    expect(fixture.markdownToHtml.length).toBeGreaterThan(40)
  })

  fixture.markdownToHtml.forEach(({ body, html }, at) => {
    it(`case ${at}: ${JSON.stringify(body).slice(0, 56)}`, () => {
      expect(markdownToHtml(body)).toBe(html)
    })
  })
})

describe("notePdfPage, against every case the Rust answers", () => {
  fixture.notePdfPage.forEach(({ title, body, page }, at) => {
    it(`case ${at}: ${JSON.stringify(title)}`, () => {
      expect(notePdfPage(title, body)).toBe(page)
    })
  })
})

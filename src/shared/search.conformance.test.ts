// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { matchNote, queryTerms, snippetAround, type SearchMatch } from "./search"
import { formatDailyTitle, isBlankDailyBody, parseDailyNoteName, toDailyNoteName } from "./date"

/*
 * The other half of `conformance/search.json`.
 *
 * Its readme says "both read this" and only the Rust did. Which left the
 * traps it was written to pin — `\b` following `\w`, so `caf` is a whole word
 * in `café`; indices counted in UTF-16 code units, where Rust panics rather
 * than being merely wrong — holding the Rust to an answer nothing was checking
 * this side still gave.
 */
const fixture = JSON.parse(readFileSync("conformance/search.json", "utf-8")) as {
  queryTerms: { query: string; terms: string[] }[]
  snippetAround: { body: string; at: number; length: number; snippet: string }[]
  match: {
    note: { title: string; tags: string[]; body: string }
    query: string
    result: SearchMatch | null
  }[]
  dates: { name: string; parsed: string | null; title: string | null }[]
  blankBody: { body: string; title: string; blank: boolean }[]
}

describe("splitting a query, against every case the Rust answers", () => {
  fixture.queryTerms.forEach(({ query, terms }) => {
    it(`${JSON.stringify(query)}`, () => {
      expect(queryTerms(query)).toEqual(terms)
    })
  })
})

describe("cutting a snippet, against every case the Rust answers", () => {
  fixture.snippetAround.forEach(({ body, at, length, snippet }) => {
    it(`${JSON.stringify(body).slice(0, 40)} at ${at}`, () => {
      expect(snippetAround(body, at, length)).toBe(snippet)
    })
  })
})

describe("matching and scoring, against every case the Rust answers", () => {
  it("has enough of them to be worth reading", () => {
    expect(fixture.match.length).toBeGreaterThan(100)
  })

  fixture.match.forEach(({ note, query, result }, at) => {
    it(`case ${at}: ${JSON.stringify(note.title)} against ${JSON.stringify(query)}`, () => {
      expect(matchNote(note, query)).toEqual(result)
    })
  })
})

describe("reading a daily note's name, against every case the Rust answers", () => {
  fixture.dates.forEach(({ name, parsed, title }) => {
    it(`${JSON.stringify(name)}`, () => {
      const date = parseDailyNoteName(name)

      expect(date === null ? null : toDailyNoteName(date)).toBe(parsed)
      expect(date === null ? null : formatDailyTitle(date)).toBe(title)
    })
  })
})

describe("whether a daily note is still blank, against every case the Rust answers", () => {
  fixture.blankBody.forEach(({ body, title, blank }) => {
    it(`${JSON.stringify(body).slice(0, 40)} under ${title}`, () => {
      expect(isBlankDailyBody(body, title)).toBe(blank)
    })
  })
})

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { matchNote, queryTerms, snippetAround, SearchMatch, Searchable } from "../shared/search"
import {
  formatDailyTitle,
  isBlankDailyBody,
  parseDailyNoteName,
  toDailyNoteName
} from "../shared/date"

/*
 * The other half of src-tauri/src/search_conformance.rs.
 *
 * Every index in the fixture is a JavaScript string index, which is a UTF-16
 * code unit. That is the whole reason these cases exist: snippetAround slices
 * the body at an index indexOf produced, and a body with one accent in it
 * before the match cuts in the wrong place under any other counting.
 */
interface Fixture {
  queryTerms: { query: string; terms: string[] }[]
  snippetAround: { body: string; at: number; length: number; snippet: string }[]
  match: { note: Searchable; query: string; result: SearchMatch | null }[]
  dates: { name: string; parsed: string | null; title: string | null }[]
  blankBody: { body: string; title: string; blank: boolean }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/search.json", "utf-8"))

describe("the search conformance fixture", () => {
  it("says what a query is looking for", () => {
    for (const one of doc.queryTerms) {
      expect(queryTerms(one.query), JSON.stringify(one.query)).toEqual(one.terms)
    }
  })

  it("says what a snippet reads as", () => {
    for (const one of doc.snippetAround) {
      expect(snippetAround(one.body, one.at, one.length), JSON.stringify(one.body)).toBe(
        one.snippet
      )
    }
  })

  it("says which notes match a query, and how well", () => {
    for (const one of doc.match) {
      const what = `${JSON.stringify(one.note.title)} against ${JSON.stringify(one.query)}`

      expect(matchNote(one.note, one.query), what).toEqual(one.result)
    }
  })

  it("says which filenames are daily notes", () => {
    for (const one of doc.dates) {
      const date = parseDailyNoteName(one.name)

      expect(date === null ? null : toDailyNoteName(date), JSON.stringify(one.name)).toBe(
        one.parsed
      )
      expect(date === null ? null : formatDailyTitle(date)).toBe(one.title)
    }
  })

  it("says which daily notes were never written in", () => {
    for (const one of doc.blankBody) {
      expect(isBlankDailyBody(one.body, one.title), JSON.stringify(one.body)).toBe(one.blank)
    }
  })
})

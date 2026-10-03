// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { normalizeScreen } from "./screen"

/*
 * The other half of `conformance/screen.json`.
 *
 * Its readme says "both read this" and only the Rust did. `expected` was
 * generated from this side once and then held the Rust to it forever, while
 * the TypeScript it describes was never asked again — so a change here would
 * leave the Rust passing against a stale answer, and a stored session would
 * open one note on the desktop and another in the browser.
 *
 * `markdown.json` was the first of these to be noticed, and it was noticed by
 * tampering. The same method found the rest.
 */
const fixture = JSON.parse(readFileSync("conformance/screen.json", "utf-8")) as {
  cases: unknown[]
  expected: unknown[]
}

describe("every screen the Rust answers", () => {
  it("has an answer beside it", () => {
    expect(fixture.cases).toHaveLength(fixture.expected.length)
    expect(fixture.cases.length).toBeGreaterThan(20)
  })

  fixture.cases.forEach((raw, at) => {
    it(`case ${at}: ${JSON.stringify(raw)?.slice(0, 60) ?? "undefined"}`, () => {
      expect(normalizeScreen(raw)).toEqual(fixture.expected[at])
    })
  })
})

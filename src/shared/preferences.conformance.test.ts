// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { normalizePreferences } from "./preferences"

/*
 * The other half of `conformance/preferences.json`.
 *
 * Its readme has always said "both read this", and until now only the Rust
 * did: `expected` was written by hand and the Rust was held to it, while the
 * TypeScript it claims to describe was never asked. A hand-written expectation
 * that disagreed with this side would have sent the two backends apart with
 * the fixture reporting agreement — which is the one thing it exists to stop.
 *
 * Found by tampering: dropping the filter from `readExpanded` here changed the
 * answer for three cases and every test still passed.
 */
const fixture = JSON.parse(readFileSync("conformance/preferences.json", "utf-8")) as {
  cases: unknown[]
  expected: Record<string, unknown>[]
}

describe("every case the Rust answers", () => {
  it("has an answer beside it", () => {
    expect(fixture.cases).toHaveLength(fixture.expected.length)
    expect(fixture.cases.length).toBeGreaterThan(30)
  })

  fixture.cases.forEach((raw, at) => {
    it(`case ${at}: ${JSON.stringify(raw)?.slice(0, 60) ?? "undefined"}`, () => {
      expect(normalizePreferences(raw)).toEqual(fixture.expected[at])
    })
  })
})

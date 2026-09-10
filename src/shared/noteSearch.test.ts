import { describe, it, expect } from "vitest"
import { findMatches, matchNearest, stepMatch } from "./noteSearch"

describe("finding a query in a note", () => {
  it("finds every occurrence", () => {
    expect(findMatches("coffee and more coffee", "coffee")).toEqual([
      { from: 0, to: 6 },
      { from: 16, to: 22 }
    ])
  })

  it("ignores case, in both directions", () => {
    expect(findMatches("Coffee", "coffee")).toHaveLength(1)
    expect(findMatches("coffee", "COFFEE")).toHaveLength(1)
  })

  it("finds nothing for an empty query rather than everything", () => {
    expect(findMatches("coffee", "")).toEqual([])
  })

  it("counts overlapping runs the way a reader would", () => {
    // "aa" in "aaaa" is two, not three.
    expect(findMatches("aaaa", "aa")).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 }
    ])
  })

  it("takes a bracket as a bracket, not as a pattern", () => {
    // A writing app answering a regex error would be answering a question
    // nobody asked.
    expect(findMatches("a (b) c", "(")).toEqual([{ from: 2, to: 3 }])
    expect(findMatches("a.b", ".")).toEqual([{ from: 1, to: 2 }])
  })
})

describe("which match to land on", () => {
  const matches = [
    { from: 10, to: 12 },
    { from: 40, to: 42 },
    { from: 80, to: 82 }
  ]

  it("takes the one at or after the caret, so a search carries on from there", () => {
    expect(matchNearest(matches, 20)).toBe(1)
    expect(matchNearest(matches, 40)).toBe(1)
  })

  it("wraps to the first when every match is behind the caret", () => {
    expect(matchNearest(matches, 500)).toBe(0)
  })

  it("has nothing to land on when there are no matches", () => {
    expect(matchNearest([], 0)).toBe(-1)
  })
})

describe("stepping through matches", () => {
  it("goes forwards and back", () => {
    expect(stepMatch(0, 3, 1)).toBe(1)
    expect(stepMatch(1, 3, -1)).toBe(0)
  })

  it("wraps at either end", () => {
    expect(stepMatch(2, 3, 1)).toBe(0)
    expect(stepMatch(0, 3, -1)).toBe(2)
  })

  it("stays nowhere with nothing to step through", () => {
    expect(stepMatch(-1, 0, 1)).toBe(-1)
  })
})

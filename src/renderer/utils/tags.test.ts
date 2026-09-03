import { describe, it, expect } from "vitest"
import { findTags, extractTags, isTagOnlyLine } from "./tags"

describe("findTags", () => {
  it("finds a single tag with its offsets", () => {
    expect(findTags("hello #work")).toEqual([{ tag: "work", from: 6, to: 11 }])
  })

  it("finds multiple tags", () => {
    expect(findTags("#a and #b").map((t) => t.tag)).toEqual(["a", "b"])
  })

  it("allows hyphens and digits after the first letter", () => {
    expect(findTags("#side-project2").map((t) => t.tag)).toEqual(["side-project2"])
  })

  it("ignores a heading hash", () => {
    expect(findTags("# Heading")).toEqual([])
  })

  it("ignores a hash followed by a digit", () => {
    expect(findTags("#1 thing")).toEqual([])
  })

  it("returns nothing for text without tags", () => {
    expect(findTags("plain prose")).toEqual([])
  })
})

describe("extractTags", () => {
  it("dedupes case-insensitively but keeps first-seen casing", () => {
    expect(extractTags("#Work #work #WORK")).toEqual(["Work"])
  })

  it("preserves first-seen order", () => {
    expect(extractTags("#b #a #b")).toEqual(["b", "a"])
  })
})

describe("isTagOnlyLine", () => {
  it("is true for a line of only tags", () => {
    expect(isTagOnlyLine("#work #personal")).toBe(true)
  })

  it("is true with surrounding whitespace", () => {
    expect(isTagOnlyLine("   #work  ")).toBe(true)
  })

  it("is false when prose is mixed in", () => {
    expect(isTagOnlyLine("notes about #work")).toBe(false)
  })

  it("is false for an empty line", () => {
    expect(isTagOnlyLine("   ")).toBe(false)
  })

  it("is false for a heading", () => {
    expect(isTagOnlyLine("# Heading")).toBe(false)
  })
})

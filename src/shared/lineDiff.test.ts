import { describe, it, expect } from "vitest"
import { changedLines, lineDiff } from "./lineDiff"

describe("lineDiff", () => {
  it("says nothing changed when nothing did", () => {
    expect(lineDiff("a\nb", "a\nb").every((line) => line.kind === "same")).toBe(true)
  })

  it("marks an inserted line", () => {
    expect(lineDiff("a\nc", "a\nb\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "added", text: "b" },
      { kind: "same", text: "c" }
    ])
  })

  it("marks a removed line", () => {
    expect(lineDiff("a\nb\nc", "a\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "same", text: "c" }
    ])
  })

  it("shows a changed line as one out and one in", () => {
    expect(lineDiff("title: A", "title: B")).toEqual([
      { kind: "removed", text: "title: A" },
      { kind: "added", text: "title: B" }
    ])
  })

  it("handles one side being empty", () => {
    expect(lineDiff("", "a").map((line) => line.kind)).toEqual(["removed", "added"])
  })

  it("keeps the common lines it can find between edits", () => {
    const diff = lineDiff("intro\nbody\nend", "intro\nnew body\nmore\nend")
    expect(diff.filter((line) => line.kind === "same").map((line) => line.text)).toEqual([
      "intro",
      "end"
    ])
  })
})

describe("changedLines", () => {
  it("drops untouched stretches but keeps a line of context", () => {
    const diff = lineDiff("a\nb\nc\nd\ne\nf", "a\nb\nC\nd\ne\nf")
    const trimmed = changedLines(diff)

    expect(trimmed.map((line) => line.text)).toEqual(["b", "c", "C", "d"])
  })

  it("returns nothing when nothing changed", () => {
    expect(changedLines(lineDiff("a\nb", "a\nb"))).toEqual([])
  })
})

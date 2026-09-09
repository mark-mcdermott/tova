import { describe, it, expect } from "vitest"
import { matchNote, queryTerms, snippetAround } from "./search"

const note = {
  title: "Slow Morning",
  tags: ["writing", "life"],
  body: "There's a kind of quiet that only shows up before the world gets busy.\nCoffee. Empty streets."
}

describe("queryTerms", () => {
  it("splits on whitespace and lowercases", () => {
    expect(queryTerms("  Slow   Morning ")).toEqual(["slow", "morning"])
  })

  it("finds nothing to look for in an empty query", () => {
    expect(queryTerms("   ")).toEqual([])
  })
})

describe("matchNote", () => {
  it("matches a title", () => {
    expect(matchNote(note, "morning")?.where).toBe("title")
  })

  it("matches a tag", () => {
    expect(matchNote(note, "writing")?.where).toBe("tag")
  })

  it("matches a body, which is the whole point of this", () => {
    const match = matchNote(note, "quiet")
    expect(match?.where).toBe("body")
    expect(match?.snippet).toContain("quiet")
  })

  it("ignores case on every side", () => {
    expect(matchNote(note, "QUIET")).not.toBeNull()
    expect(matchNote({ ...note, title: "SLOW" }, "slow")?.where).toBe("title")
  })

  it("needs every term, but not all in the same place", () => {
    // "Slow Morning" is the title, #writing is a tag: one query, two fields.
    expect(matchNote(note, "slow writing")).not.toBeNull()
    expect(matchNote(note, "slow absent")).toBeNull()
  })

  it("reports the title when a term hits both title and body", () => {
    expect(matchNote({ ...note, body: "morning again" }, "morning")?.where).toBe("title")
  })

  it("finds nothing for an empty query rather than everything", () => {
    expect(matchNote(note, "   ")).toBeNull()
  })

  it("carries a snippet even when the reported field is the title", () => {
    const match = matchNote({ ...note, title: "Quiet" }, "quiet")
    expect(match?.where).toBe("title")
    expect(match?.snippet).toContain("quiet")
  })
})

describe("snippetAround", () => {
  it("collapses the whitespace so a wrapped paragraph reads as one line", () => {
    expect(snippetAround("one\n\n  two", 4, 3)).toBe("one two")
  })

  it("marks only the ends it actually cut", () => {
    const long = `${"a".repeat(100)}needle${"b".repeat(100)}`
    const snippet = snippetAround(long, 100, 6)

    expect(snippet.startsWith("…")).toBe(true)
    expect(snippet.endsWith("…")).toBe(true)
    expect(snippet).toContain("needle")
  })

  it("leaves a short body whole, with no ellipses", () => {
    expect(snippetAround("just this", 5, 4)).toBe("just this")
  })
})

describe("relevance", () => {
  const note = (title: string, tags: string[], body: string) => ({ title, tags, body })
  const score = (n: { title: string; tags: string[]; body: string }, q: string) =>
    matchNote(n, q)?.score ?? 0

  it("ranks a title you typed exactly above one that merely contains it", () => {
    const exact = note("morning", [], "")
    const contains = note("a slow morning indeed", [], "")
    expect(score(exact, "morning")).toBeGreaterThan(score(contains, "morning"))
  })

  it("ranks a title starting with the word above one ending with it", () => {
    expect(score(note("morning pages", [], ""), "morning")).toBeGreaterThan(
      score(note("pages at morning time", [], ""), "morning")
    )
  })

  it("ranks a whole word above the middle of a longer one", () => {
    expect(score(note("", [], "the morning was"), "morning")).toBeGreaterThan(
      score(note("", [], "in morningside town"), "morning")
    )
  })

  it("ranks a title above a tag above a body", () => {
    const inTitle = score(note("morning", [], ""), "morning")
    const inTag = score(note("x", ["morning"], ""), "morning")
    const inBody = score(note("x", [], "morning"), "morning")

    expect(inTitle).toBeGreaterThan(inTag)
    expect(inTag).toBeGreaterThan(inBody)
  })

  it("ranks a note about a thing above one that mentions it once", () => {
    const about = note("x", [], "morning morning morning morning")
    const mentions = note("x", [], "morning")
    expect(score(about, "morning")).toBeGreaterThan(score(mentions, "morning"))
  })

  it("stops counting repeats before length becomes the signal", () => {
    const five = note("x", [], "morning ".repeat(6))
    const fifty = note("x", [], "morning ".repeat(50))
    expect(score(fifty, "morning")).toBe(score(five, "morning"))
  })

  it("ranks the phrase above the same words scattered", () => {
    const phrase = note("x", [], "a slow morning by the lake")
    const scattered = note("x", [], "slow going. later, one morning, rain")
    expect(score(phrase, "slow morning")).toBeGreaterThan(score(scattered, "slow morning"))
  })

  it("adds up across the fields a term appears in", () => {
    const both = note("morning", [], "morning again")
    const titleOnly = note("morning", [], "")
    expect(score(both, "morning")).toBeGreaterThan(score(titleOnly, "morning"))
  })

  it("scores nothing when it does not match at all", () => {
    expect(matchNote(note("x", [], "y"), "absent")).toBeNull()
  })

  it("treats a term with regex characters as text", () => {
    // A stray "(" must not throw when it reaches the word-boundary test.
    expect(() => matchNote(note("a (b)", [], ""), "(b)")).not.toThrow()
    expect(matchNote(note("a (b)", [], ""), "(b)")).not.toBeNull()
  })
})


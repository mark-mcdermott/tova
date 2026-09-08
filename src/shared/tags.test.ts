import { describe, it, expect } from "vitest"
import {
  findTags,
  extractTags,
  isTagOnlyLine,
  normalizeTag,
  addTagEdit,
  tagHeaderLines,
  bodyStart
} from "./tags"

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

describe("normalizeTag", () => {
  it("takes a bare word", () => expect(normalizeTag("writing")).toBe("writing"))
  it("takes one already written with a hash", () => expect(normalizeTag("#writing")).toBe("writing"))
  it("trims what was typed", () => expect(normalizeTag("  writing  ")).toBe("writing"))
  it("keeps hyphens and digits after the first letter", () =>
    expect(normalizeTag("half-formed2")).toBe("half-formed2"))

  it("refuses what would not parse back out of the prose", () => {
    expect(normalizeTag("2026")).toBeNull()
    expect(normalizeTag("two words")).toBeNull()
    expect(normalizeTag("")).toBeNull()
    expect(normalizeTag("#")).toBeNull()
  })
})

describe("addTagEdit", () => {
  function applied(doc: string, tag: string): string | null {
    const edit = addTagEdit(doc, tag)
    return edit === null ? null : doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
  }

  it("joins a leading tags-only line", () => {
    expect(applied("#thoughts\n\nCoffee.\n", "writing")).toBe("#thoughts #writing\n\nCoffee.\n")
  })

  it("opens a new line when the note starts with prose", () => {
    expect(applied("Coffee.\n", "writing")).toBe("#writing\n\nCoffee.\n")
  })

  it("does not leave a blank line in an empty note", () => {
    expect(applied("", "writing")).toBe("#writing\n")
  })

  it("says nothing to do for a tag the note already carries", () => {
    expect(addTagEdit("#writing\n\nCoffee.\n", "writing")).toBeNull()
    // Including one that only appears mid-sentence.
    expect(addTagEdit("Thinking about #writing today.\n", "writing")).toBeNull()
  })

  it("matches an existing tag whatever its case", () => {
    expect(addTagEdit("#Writing\n\nCoffee.\n", "writing")).toBeNull()
  })

  it("says nothing to do for a name that cannot be a tag", () => {
    expect(addTagEdit("Coffee.\n", "two words")).toBeNull()
  })
})

describe("tagHeaderLines", () => {
  it("counts the tags line and the blank line under it", () => {
    expect(tagHeaderLines(["#a #b", "", "Prose."])).toBe(2)
  })

  it("counts just the tags line when the prose follows straight on", () => {
    expect(tagHeaderLines(["#a", "Prose.", ""])).toBe(1)
  })

  it("counts nothing when the note does not open with tags", () => {
    expect(tagHeaderLines(["Coffee. #later", "", "More."])).toBe(0)
  })

  it("keeps the tags on screen when they are the whole note", () => {
    // Hiding the lot would leave a blank editor and no way to see why.
    expect(tagHeaderLines(["#a"])).toBe(0)
    expect(tagHeaderLines(["#a", ""])).toBe(1)
  })
})

describe("bodyStart", () => {
  it("starts past the tags and the blank line", () => {
    const doc = "#a #b\n\nCoffee.\n"
    expect(doc.slice(bodyStart(doc))).toBe("Coffee.\n")
  })

  it("starts past a tags line the prose follows straight on from", () => {
    const doc = "#a\nCoffee.\n"
    expect(doc.slice(bodyStart(doc))).toBe("Coffee.\n")
  })

  it("starts at the top when the note opens with prose", () => {
    expect(bodyStart("Coffee. #later\n")).toBe(0)
  })

  it("starts at the top when the tags are the whole note", () => {
    expect(bodyStart("#a")).toBe(0)
  })
})

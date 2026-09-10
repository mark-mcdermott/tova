import { describe, it, expect } from "vitest"
import {
  allTags,
  applyEdits,
  tagToggleEdits,
  removeOccurrenceEdits,
  removeTagEdits,
  tagOrigin,
  findTags,
  extractTags,
  isTagOnlyLine,
  normalizeManualTags,
  normalizeTag,
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
  it("takes one already written with a hash", () =>
    expect(normalizeTag("#writing")).toBe("writing"))
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

describe("removing a tag from a note", () => {
  const remove = (doc: string, tag: string) => applyEdits(doc, removeTagEdits(doc, tag))

  it("takes the word off a line of nothing but tags", () => {
    expect(remove("#a #b #c\n\nProse.", "b")).toBe("#a #c\n\nProse.")
  })

  it("keeps the remaining tags one space apart", () => {
    expect(remove("#a #b\n\nProse.", "a")).toBe("#b\n\nProse.")
  })

  it("strips only the hash from a tag inside a sentence", () => {
    // The sentence is the writer's. Cutting the word out of it is not this
    // control's business — de-tagging it is.
    expect(remove("I love #thoughts about coffee.", "thoughts")).toBe(
      "I love thoughts about coffee."
    )
  })

  it("removes the line and the blank under it when nothing is left on it", () => {
    expect(remove("#work\n\nProse.", "work")).toBe("Prose.")
  })

  it("leaves a note that is nothing but its tag empty", () => {
    expect(remove("#work", "work")).toBe("")
  })

  it("clears a tags line further down without leaving a gap behind", () => {
    expect(remove("Prose.\n\n#work\n\nMore.", "work")).toBe("Prose.\n\nMore.")
  })

  it("takes every occurrence, since one left behind puts the chip straight back", () => {
    const doc = "#work\n\nA #work note about #work."
    expect(remove(doc, "work")).toBe("A work note about work.")
  })

  it("removes a row tag and its inline uses together", () => {
    expect(remove("#work\n\nSee #work.", "work")).toBe("See work.")
  })

  it("ignores case, so no stray occurrence survives", () => {
    expect(remove("#Work\n\nSee #work and #WORK.", "work")).toBe("See work and WORK.")
  })

  it("leaves other tags alone", () => {
    expect(remove("#a #b\n\nProse with #c.", "b")).toBe("#a\n\nProse with #c.")
  })

  it("does nothing for a tag the note does not carry", () => {
    expect(removeTagEdits("#a\n\nProse.", "zzz")).toEqual([])
  })
})

describe("removing one written occurrence", () => {
  const removeAt = (doc: string, needle: string) => {
    const from = doc.indexOf(needle)
    return applyEdits(doc, removeOccurrenceEdits(doc, from, from + needle.length))
  }

  it("leaves the other uses of the same tag in place", () => {
    // Which is why the chip stays: the note still carries the tag.
    expect(removeAt("A #work note about #work.", "#work")).toBe("A work note about #work.")
  })

  it("takes the line when it was the only tag on it", () => {
    expect(removeAt("#work\n\nProse.", "#work")).toBe("Prose.")
  })

  it("leaves the line when other tags share it", () => {
    expect(removeAt("#a #b\n\nProse.", "#a")).toBe("#b\n\nProse.")
  })
})

describe("what typing # does to a selection", () => {
  const toggle = (doc: string, from: number, to: number) => {
    const edits = tagToggleEdits(doc, from, to)
    return edits === null ? null : applyEdits(doc, edits)
  }
  const at = (doc: string, needle: string) => doc.indexOf(needle)

  it("makes a tag of a selected word", () => {
    const doc = "Coffee and streets."
    expect(toggle(doc, at(doc, "streets"), at(doc, "streets") + 7)).toBe("Coffee and #streets.")
  })

  it("takes the tag off a selected tag", () => {
    const doc = "Coffee and #streets."
    const from = at(doc, "#streets")
    expect(toggle(doc, from, from + 8)).toBe("Coffee and streets.")
  })

  it("takes the tag off when the caret is inside one", () => {
    const doc = "Coffee and #streets."
    const inside = at(doc, "#streets") + 3
    expect(toggle(doc, inside, inside)).toBe("Coffee and streets.")
  })

  it("lets # type itself when the caret is only resting against a tag", () => {
    // Which is how a tag gets written in the first place.
    const doc = "Coffee and #streets."
    expect(toggle(doc, at(doc, "#streets"), at(doc, "#streets"))).toBeNull()
    expect(toggle(doc, at(doc, "#streets") + 8, at(doc, "#streets") + 8)).toBeNull()
  })

  it("lets # type itself in open prose", () => {
    expect(toggle("Coffee and streets.", 6, 6)).toBeNull()
  })

  it("refuses a selection that is not a tag name", () => {
    const doc = "Coffee and streets."
    expect(toggle(doc, 0, 10)).toBeNull()
    expect(toggle(doc, at(doc, "streets"), at(doc, "streets") + 8)).toBeNull()
  })

  it("refuses a selection starting with a digit, as the tag rule does", () => {
    const doc = "Room 101 upstairs."
    expect(toggle(doc, at(doc, "101"), at(doc, "101") + 3)).toBeNull()
  })

  it("takes the whole line when untagging leaves a tags line empty", () => {
    const doc = "#work\n\nProse."
    expect(toggle(doc, 2, 2)).toBe("Prose.")
  })
})

describe("which kind of tag it is", () => {
  it("calls one the row put in front matter a row tag", () => {
    expect(tagOrigin(["work"], "work")).toBe("row")
  })

  it("calls one that is only in the prose an inline tag", () => {
    expect(tagOrigin([], "thoughts")).toBe("inline")
  })

  it("keeps a row tag a row tag when the same word is typed into a sentence", () => {
    // Typing it into prose does not take it out of front matter, so it does
    // not stop being the tag the reader asked for.
    expect(tagOrigin(["work"], "work")).toBe("row")
  })

  it("matches without regard to case, as the row does", () => {
    expect(tagOrigin(["Work"], "work")).toBe("row")
  })
})

describe("every tag a note carries", () => {
  it("puts the row's first, then the prose's", () => {
    expect(allTags(["work"], "A note about #thoughts.")).toEqual(["work", "thoughts"])
  })

  it("counts a tag in both only once, as the row wrote it", () => {
    expect(allTags(["Work"], "A note about #work.")).toEqual(["Work"])
  })

  it("is just the prose's when front matter has none", () => {
    expect(allTags([], "#a and #b.")).toEqual(["a", "b"])
  })
})

describe("reading front matter tags", () => {
  it("takes a list", () => {
    expect(normalizeManualTags(["work", "writing"])).toEqual(["work", "writing"])
  })

  it("takes a lone string, which is how YAML may have it", () => {
    expect(normalizeManualTags("work")).toEqual(["work"])
  })

  it("drops anything that is not a tag name", () => {
    expect(normalizeManualTags(["work", "not a tag", "#leading", "1st", ""])).toEqual([
      "work",
      "leading"
    ])
  })

  it("drops duplicates, ignoring case", () => {
    expect(normalizeManualTags(["Work", "work", "WORK"])).toEqual(["Work"])
  })

  it("is empty for anything that is not a list of names", () => {
    for (const value of [null, undefined, 3, {}, [1, 2]]) {
      expect(normalizeManualTags(value)).toEqual([])
    }
  })
})

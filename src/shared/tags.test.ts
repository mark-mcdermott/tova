import { describe, it, expect } from "vitest"
import {
  applyEdits,
  removeOccurrenceEdits,
  removeTagEdits,
  tagOrigin,
  findTags,
  extractTags,
  isTagOnlyLine,
  normalizeTag,
  addTagEdit,
  tagHeaderLines,
  bodyStart,
  caretAfterTagEdit
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

describe("caretAfterTagEdit", () => {
  const caretIn = (doc: string, tag: string, head = 0) => {
    const edit = addTagEdit(doc, tag)
    if (edit === null) throw new Error("expected an edit")
    const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
    return {
      at: caretAfterTagEdit(doc, edit, head),
      rest: next.slice(caretAfterTagEdit(doc, edit, head))
    }
  }

  it("puts the caret past the tags line on an empty note", () => {
    // Left at 0 it sits inside the line the tag row already shows, and the
    // editor keeps that line revealed — the tag then appears twice.
    expect(caretIn("", "mynotes").rest).toBe("")
    expect(caretIn("", "mynotes").at).toBe("#mynotes\n".length)
  })

  it("puts it at the first word of the prose", () => {
    expect(caretIn("Coffee.\n", "mynotes").rest).toBe("Coffee.\n")
  })

  it("does the same when a tags line already exists", () => {
    expect(caretIn("#thoughts\n\nCoffee.\n", "mynotes").rest).toBe("Coffee.\n")
  })

  it("leaves a caret that is already in the prose where it was", () => {
    // Writer is mid-sentence and adds a tag from the row; the caret should not
    // jump to the top of the note.
    const doc = "Coffee. Empty streets.\n"
    const head = 8
    const edit = addTagEdit(doc, "mynotes")
    if (edit === null) throw new Error("expected an edit")

    const at = caretAfterTagEdit(doc, edit, head)
    const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
    expect(next.slice(at)).toBe("Empty streets.\n")
  })
})

describe("where a tag came from", () => {
  it("calls a tag on the opening line a row tag", () => {
    expect(tagOrigin("#work\n\nProse.", "work")).toBe("row")
  })

  it("calls one written into a sentence an inline tag", () => {
    expect(tagOrigin("I love #thoughts about coffee.", "thoughts")).toBe("inline")
  })

  it("keeps a row tag a row tag when the same word is typed inline later", () => {
    expect(tagOrigin("#work\n\nA note about #work.", "work")).toBe("row")
  })

  it("matches without regard to case, as the tag row does", () => {
    expect(tagOrigin("#Work\n\nProse.", "work")).toBe("row")
  })

  it("calls a tags line further down the note inline, since the row did not write it", () => {
    expect(tagOrigin("Prose.\n\n#work\n", "work")).toBe("inline")
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

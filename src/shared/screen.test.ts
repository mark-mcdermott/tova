import { describe, it, expect } from "vitest"
import { normalizeScreen } from "./screen"

describe("reading a remembered screen", () => {
  it("takes a note", () => {
    expect(normalizeScreen({ kind: "note", noteId: "notes/river.md" })).toEqual({
      kind: "note",
      noteId: "notes/river.md"
    })
  })

  it("takes each kind of listing", () => {
    const targets = [
      { kind: "section", section: "ideas" },
      { kind: "folder", folder: "drafts" },
      { kind: "blog", blog: "markmcdermott.io" },
      { kind: "tag", tag: "writing" },
      { kind: "tags" }
    ]

    for (const target of targets) {
      expect(normalizeScreen({ kind: "index", target })).toEqual({ kind: "index", target })
    }
  })

  it("refuses a search, which would look remembered and would not be", () => {
    // Its results were read from the vault as it stood hours ago.
    expect(normalizeScreen({ kind: "index", target: { kind: "search", query: "wri" } })).toBeNull()
  })

  it("refuses a note id that climbs out of the vault", () => {
    expect(normalizeScreen({ kind: "note", noteId: "../../etc/passwd" })).toBeNull()
  })

  it("refuses anything that is not a screen", () => {
    for (const value of [null, undefined, 3, "notes/river.md", {}, [], { kind: "elsewhere" }]) {
      expect(normalizeScreen(value)).toBeNull()
    }
  })

  it("refuses a screen missing the part that says where", () => {
    expect(normalizeScreen({ kind: "note" })).toBeNull()
    expect(normalizeScreen({ kind: "note", noteId: "   " })).toBeNull()
    expect(normalizeScreen({ kind: "index" })).toBeNull()
    expect(normalizeScreen({ kind: "index", target: { kind: "tag" } })).toBeNull()
  })

  it("survives a round trip through JSON, which is how it is stored", () => {
    const screen = { kind: "index" as const, target: { kind: "tag" as const, tag: "writing" } }
    expect(normalizeScreen(JSON.parse(JSON.stringify(screen)))).toEqual(screen)
  })
})

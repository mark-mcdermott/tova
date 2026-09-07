import { describe, it, expect } from "vitest"
import {
  toNoteId,
  parseNoteId,
  trashLocation,
  restoreLocation,
  isValidFolderName,
  sortNotes
} from "./noteLocation"
import { NoteSummary } from "./types"

describe("parseNoteId", () => {
  it("parses a loose note", () => {
    expect(parseNoteId("notes/river.md")).toEqual({
      section: "notes",
      folder: null,
      filename: "river.md"
    })
  })

  it("parses a note inside a folder", () => {
    expect(parseNoteId("notes/ideas/river.md")).toEqual({
      section: "notes",
      folder: "ideas",
      filename: "river.md"
    })
  })

  it("parses a daily note", () => {
    expect(parseNoteId("daily/2026-09-03.md")?.section).toBe("daily")
  })

  it("rejects a traversal attempt", () => {
    expect(parseNoteId("notes/../../etc/passwd.md")).toBeNull()
  })

  it("rejects a bare .. segment", () => {
    expect(parseNoteId("../secrets.md")).toBeNull()
  })

  it("rejects an absolute path", () => {
    expect(parseNoteId("/etc/passwd.md")).toBeNull()
  })

  it("rejects a backslash path", () => {
    expect(parseNoteId("notes\\..\\secrets.md")).toBeNull()
  })

  it("rejects a null byte", () => {
    expect(parseNoteId("notes/river\0.md")).toBeNull()
  })

  it("rejects empty segments", () => {
    expect(parseNoteId("notes//river.md")).toBeNull()
  })

  it("rejects an unknown section", () => {
    expect(parseNoteId("secrets/river.md")).toBeNull()
  })

  it("rejects a non-markdown file", () => {
    expect(parseNoteId("notes/river.txt")).toBeNull()
  })

  it("rejects nesting deeper than one folder", () => {
    expect(parseNoteId("notes/a/b/river.md")).toBeNull()
  })

  it("rejects a folder under daily", () => {
    expect(parseNoteId("daily/sub/2026-09-03.md")).toBeNull()
  })

  it("round-trips through toNoteId", () => {
    for (const id of ["notes/river.md", "notes/ideas/river.md", "trash/river.md"]) {
      expect(toNoteId(parseNoteId(id)!)).toBe(id)
    }
  })
})

describe("isValidFolderName", () => {
  it("accepts an ordinary name", () => {
    expect(isValidFolderName("ideas")).toBe(true)
  })

  it("rejects separators and dot segments", () => {
    expect(isValidFolderName("a/b")).toBe(false)
    expect(isValidFolderName("..")).toBe(false)
    expect(isValidFolderName("  ")).toBe(false)
  })
})

describe("trash and restore transitions", () => {
  it("flattens a foldered note into trash", () => {
    expect(toNoteId(trashLocation("river.md"))).toBe("trash/river.md")
  })

  it("restores to the recorded folder", () => {
    const location = restoreLocation({ section: "notes", folder: "ideas" }, "river.md")
    expect(toNoteId(location)).toBe("notes/ideas/river.md")
  })

  it("restores a loose note to the notes root", () => {
    const location = restoreLocation({ section: "notes" }, "river.md")
    expect(toNoteId(location)).toBe("notes/river.md")
  })

  it("restores a daily note to daily", () => {
    const location = restoreLocation({ section: "daily" }, "2026-09-03.md")
    expect(toNoteId(location)).toBe("daily/2026-09-03.md")
  })

  it("ignores a folder recorded against daily", () => {
    const location = restoreLocation({ section: "daily", folder: "ideas" }, "d.md")
    expect(toNoteId(location)).toBe("daily/d.md")
  })

  it("falls back to notes when the section is missing", () => {
    expect(toNoteId(restoreLocation({}, "river.md"))).toBe("notes/river.md")
  })

  it("falls back to notes when the section is nonsense", () => {
    expect(toNoteId(restoreLocation({ section: "nope" }, "river.md"))).toBe("notes/river.md")
  })

  it("never restores back into trash", () => {
    expect(toNoteId(restoreLocation({ section: "trash" }, "river.md"))).toBe("notes/river.md")
  })

  it("rejects a traversal folder recorded in front matter", () => {
    const location = restoreLocation({ section: "notes", folder: "../.." }, "river.md")
    expect(toNoteId(location)).toBe("notes/river.md")
  })

  it("survives a full delete then restore round trip", () => {
    const original = parseNoteId("notes/ideas/river.md")!
    const trashed = trashLocation(original.filename)
    expect(toNoteId(trashed)).toBe("trash/river.md")

    const restored = restoreLocation(
      { section: original.section, folder: original.folder ?? "" },
      trashed.filename
    )
    expect(toNoteId(restored)).toBe("notes/ideas/river.md")
  })
})

describe("sortNotes", () => {
  const note = (title: string, updatedAt: number): NoteSummary => ({
    id: `notes/${title}.md`,
    title,
    section: "notes",
    folder: null,
    tags: [],
    favorite: false,
    updatedAt,
    deletedAt: null
  })

  it("puts the most recently updated first", () => {
    const sorted = sortNotes([note("old", 1), note("new", 3), note("mid", 2)])
    expect(sorted.map((n) => n.title)).toEqual(["new", "mid", "old"])
  })

  it("breaks ties on title", () => {
    const sorted = sortNotes([note("b", 1), note("a", 1)])
    expect(sorted.map((n) => n.title)).toEqual(["a", "b"])
  })

  it("does not mutate the input", () => {
    const input = [note("old", 1), note("new", 2)]
    sortNotes(input)
    expect(input.map((n) => n.title)).toEqual(["old", "new"])
  })
})

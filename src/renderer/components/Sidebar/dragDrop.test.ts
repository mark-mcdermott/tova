import { describe, it, expect } from "vitest"
import { canDrop, describeDrop, DropTarget } from "./dragDrop"
import { NoteSummary } from "../../../shared/types"

function note(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "notes/river.md",
    title: "River",
    section: "notes",
    folder: null,
    tags: [],
    updatedAt: 0,
    deletedAt: null,
    ...overrides
  }
}

const ideas: DropTarget = { kind: "folder", folder: "ideas" }
const root: DropTarget = { kind: "notesRoot" }
const trash: DropTarget = { kind: "trash" }
const daily: DropTarget = { kind: "daily" }

describe("canDrop onto a folder", () => {
  it("accepts a loose note", () => {
    expect(canDrop(note(), ideas)).toBe(true)
  })

  it("accepts a note from another folder", () => {
    expect(canDrop(note({ folder: "drafts" }), ideas)).toBe(true)
  })

  it("refuses the folder the note is already in", () => {
    expect(canDrop(note({ folder: "ideas" }), ideas)).toBe(false)
  })

  it("refuses a daily note, whose filename is its date", () => {
    expect(canDrop(note({ section: "daily" }), ideas)).toBe(false)
  })

  it("refuses a trashed note", () => {
    expect(canDrop(note({ section: "trash" }), ideas)).toBe(false)
  })
})

describe("canDrop onto the notes root", () => {
  it("accepts a note that is in a folder", () => {
    expect(canDrop(note({ folder: "ideas" }), root)).toBe(true)
  })

  it("refuses a note already at the root", () => {
    expect(canDrop(note(), root)).toBe(false)
  })

  it("refuses a daily note", () => {
    expect(canDrop(note({ section: "daily", folder: "ideas" }), root)).toBe(false)
  })
})

describe("canDrop onto Trash", () => {
  it("accepts a loose note", () => {
    expect(canDrop(note(), trash)).toBe(true)
  })

  it("accepts a note in a folder", () => {
    expect(canDrop(note({ folder: "ideas" }), trash)).toBe(true)
  })

  it("accepts a daily note", () => {
    expect(canDrop(note({ section: "daily" }), trash)).toBe(true)
  })

  it("refuses one already in Trash", () => {
    expect(canDrop(note({ section: "trash" }), trash)).toBe(false)
  })
})

describe("canDrop onto Daily", () => {
  it("refuses everything", () => {
    for (const n of [note(), note({ folder: "ideas" }), note({ section: "daily" })]) {
      expect(canDrop(n, daily)).toBe(false)
    }
  })
})

describe("describeDrop", () => {
  it("names the destination folder", () => {
    expect(describeDrop(note(), ideas)).toBe("Move River to ideas")
  })

  it("names the folder being left", () => {
    expect(describeDrop(note({ folder: "ideas" }), root)).toBe("Move River out of ideas")
  })

  it("describes trashing", () => {
    expect(describeDrop(note(), trash)).toBe("Move River to Trash")
  })

  it("falls back for an untitled note", () => {
    expect(describeDrop(note({ title: "" }), trash)).toBe("Move note to Trash")
  })

  it("returns nothing for a drop that is not allowed", () => {
    expect(describeDrop(note(), daily)).toBeNull()
  })
})

import { describe, it, expect } from "vitest"
import { composeTarget } from "./composeTarget"
import { NoteSummary } from "./types"

function note(partial: Partial<NoteSummary>): NoteSummary {
  return {
    id: "notes/a.md",
    title: "A",
    section: "notes",
    folder: null,
    tags: [],
    manualTags: [],
    favorite: false,
    updatedAt: 0,
    createdAt: 0,
    deletedAt: null,
    ...partial
  }
}

describe("composeTarget", () => {
  it("writes into the section whose index is open", () => {
    expect(composeTarget("index", { kind: "section", section: "ideas" }, null)).toEqual({
      section: "ideas",
      folder: null
    })
  })

  it("writes into the folder whose index is open", () => {
    expect(composeTarget("index", { kind: "folder", folder: "drafts" }, null)).toEqual({
      section: "notes",
      folder: "drafts"
    })
  })

  it("leaves Daily to make its own note", () => {
    // One per day, created for you — a second one has nowhere to go.
    expect(composeTarget("index", { kind: "section", section: "daily" }, null)).toBeNull()
    expect(composeTarget("editor", null, note({ section: "daily" }))).toBeNull()
  })

  it("falls back to Notes from Trash, which is not a place to start", () => {
    expect(composeTarget("index", { kind: "section", section: "trash" }, null)).toEqual({
      section: "notes",
      folder: null
    })
  })

  it("falls back to Notes from a tag, which is a view rather than a place", () => {
    expect(composeTarget("index", { kind: "tag", tag: "writing" }, null)).toEqual({
      section: "notes",
      folder: null
    })
    expect(composeTarget("index", { kind: "tags" }, null)).toEqual({
      section: "notes",
      folder: null
    })
  })

  it("follows the open note when there is no index", () => {
    expect(composeTarget("editor", null, note({ section: "journal" }))).toEqual({
      section: "journal",
      folder: null
    })
  })

  it("keeps a foldered note's folder", () => {
    expect(composeTarget("editor", null, note({ folder: "drafts" }))).toEqual({
      section: "notes",
      folder: "drafts"
    })
  })

  it("writes into Notes when nothing is open at all", () => {
    expect(composeTarget("editor", null, null)).toEqual({ section: "notes", folder: null })
  })
})

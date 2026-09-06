import { describe, it, expect } from "vitest"
import { breadcrumbFor } from "./breadcrumb"
import { NoteSummary } from "../../../shared/types"

function note(overrides: Partial<NoteSummary>): NoteSummary {
  return {
    id: "notes/river.md",
    title: "Project River",
    section: "notes",
    folder: null,
    tags: [],
    updatedAt: 0,
    deletedAt: null,
    ...overrides
  }
}

describe("breadcrumbFor", () => {
  it("shows section then title for a loose note", () => {
    expect(breadcrumbFor(note({})).map((crumb) => crumb.label)).toEqual(["Notes", "Project River"])
  })

  it("inserts the folder between them", () => {
    const crumbs = breadcrumbFor(note({ folder: "ideas" }))
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Notes", "ideas", "Project River"])
  })

  it("never exceeds three levels", () => {
    expect(breadcrumbFor(note({ folder: "ideas" }))).toHaveLength(3)
  })

  it("labels a daily note's section", () => {
    const crumbs = breadcrumbFor(note({ section: "daily", title: "9/3/26" }))
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Daily", "9/3/26"])
  })

  it("labels a trashed note's section", () => {
    expect(breadcrumbFor(note({ section: "trash" }))[0].label).toBe("Trash")
  })

  it("ignores a folder recorded against daily", () => {
    const crumbs = breadcrumbFor(note({ section: "daily", folder: "ideas" }))
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Daily", "Project River"])
  })

  it("falls back to Untitled for a blank title", () => {
    expect(breadcrumbFor(note({ title: "   " })).at(-1)?.label).toBe("Untitled")
  })

  it("leaves the note itself unlinked", () => {
    expect(breadcrumbFor(note({ folder: "ideas" })).at(-1)?.target).toBeNull()
  })

  it("targets the sidebar keys the tree uses", () => {
    const crumbs = breadcrumbFor(note({ folder: "ideas" }))
    expect(crumbs.map((crumb) => crumb.target)).toEqual(["notes", "folder:ideas", null])
  })
})

import { describe, it, expect } from "vitest"
import { breadcrumbFor, showsTrail } from "./breadcrumb"
import { NoteSummary } from "../../../shared/types"

function note(overrides: Partial<NoteSummary>): NoteSummary {
  return {
    id: "notes/river.md",
    title: "Project River",
    section: "notes",
    folder: null,
    tags: [],
    favorite: false,
    updatedAt: 0,
    createdAt: 0,
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

describe("whether a trail is worth drawing", () => {
  it("drops a lone crumb that only repeats the heading", () => {
    // The section indexes: "Ideas" above "Ideas" said nothing twice.
    expect(showsTrail([{ label: "Ideas" }], "Ideas")).toBe(false)
    expect(showsTrail([{ label: "Trash" }], "Trash")).toBe(false)
  })

  it("keeps a lone crumb that says something the heading does not", () => {
    expect(showsTrail([{ label: "Tags" }], "#writing")).toBe(true)
  })

  it("keeps two crumbs even when the last one matches the heading", () => {
    // "Notes / untitled-2" over "untitled-2" is saying where the note lives,
    // which is not what the heading says.
    expect(showsTrail([{ label: "Notes" }, { label: "untitled-2" }], "untitled-2")).toBe(true)
  })

  it("draws nothing for an empty trail rather than an empty list", () => {
    expect(showsTrail([], "Ideas")).toBe(false)
  })

  it("always draws a note's trail, which carries its section as well as its name", () => {
    const base = {
      id: "notes/loose.md",
      title: "Loose",
      section: "notes" as const,
      folder: null,
      tags: [],
      favorite: false,
      updatedAt: 1,
      createdAt: 1,
      deletedAt: null
    }

    for (const note of [base, { ...base, folder: "ideas" }, { ...base, title: "" }]) {
      const crumbs = breadcrumbFor(note)
      expect(showsTrail(crumbs, crumbs[crumbs.length - 1].label)).toBe(true)
    }
  })
})

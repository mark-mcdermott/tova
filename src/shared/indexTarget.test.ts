import { describe, it, expect } from "vitest"
import { NoteSummary } from "./types"
import { indexNotes, indexTitle, indexKey, tagCounts } from "./indexTarget"
import { DEFAULT_SECTIONS } from "./sections"

function note(partial: Partial<NoteSummary> & { title: string }): NoteSummary {
  return {
    id: `notes/${partial.title}.md`,
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

describe("indexTitle", () => {
  it("names each kind of index", () => {
    expect(indexTitle({ kind: "section", section: "daily" }, DEFAULT_SECTIONS)).toBe("Daily")
    expect(indexTitle({ kind: "folder", folder: "drafts" }, DEFAULT_SECTIONS)).toBe("drafts")
    expect(indexTitle({ kind: "tag", tag: "writing" }, DEFAULT_SECTIONS)).toBe("#writing")
    expect(indexTitle({ kind: "tags" }, DEFAULT_SECTIONS)).toBe("Tags")
  })
})

describe("indexKey", () => {
  it("keeps folders and tags from colliding with sections", () => {
    expect(indexKey({ kind: "section", section: "notes" })).toBe("notes")
    expect(indexKey({ kind: "folder", folder: "notes" })).toBe("folder:notes")
    expect(indexKey({ kind: "tag", tag: "notes" })).toBe("tag:notes")
  })
})

describe("indexNotes", () => {
  const notes = [
    note({ title: "Beta", updatedAt: 3, createdAt: 1 }),
    note({ title: "Alpha", updatedAt: 1, createdAt: 3 }),
    note({ title: "Gamma", updatedAt: 2, createdAt: 2 })
  ]

  it("sorts by last edited", () => {
    const got = indexNotes(notes, { kind: "section", section: "notes" }, "updated")
    expect(got.map((n) => n.title)).toEqual(["Beta", "Gamma", "Alpha"])
  })

  it("sorts by created", () => {
    const got = indexNotes(notes, { kind: "section", section: "notes" }, "created")
    expect(got.map((n) => n.title)).toEqual(["Alpha", "Gamma", "Beta"])
  })

  it("sorts by title, ignoring case", () => {
    const mixed = [note({ title: "beta" }), note({ title: "Alpha" })]
    const got = indexNotes(mixed, { kind: "section", section: "notes" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Alpha", "beta"])
  })

  it("floats favourites above everything, whatever the sort", () => {
    const withFavourite = [...notes, note({ title: "Pinned", updatedAt: 0, favorite: true })]
    const got = indexNotes(withFavourite, { kind: "section", section: "notes" }, "updated")
    expect(got[0].title).toBe("Pinned")
  })

  it("orders favourites among themselves by the chosen sort", () => {
    const two = [
      note({ title: "Older", updatedAt: 1, favorite: true }),
      note({ title: "Newer", updatedAt: 5, favorite: true })
    ]
    const got = indexNotes(two, { kind: "section", section: "notes" }, "updated")
    expect(got.map((n) => n.title)).toEqual(["Newer", "Older"])
  })

  it("shows a section's foldered notes too, not just the loose ones", () => {
    const mixed = [note({ title: "Loose" }), note({ title: "Filed", folder: "drafts" })]
    const got = indexNotes(mixed, { kind: "section", section: "notes" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Filed", "Loose"])
  })

  it("shows only the folder asked for", () => {
    const mixed = [
      note({ title: "Filed", folder: "drafts" }),
      note({ title: "Elsewhere", folder: "ideas" }),
      note({ title: "Loose" })
    ]
    const got = indexNotes(mixed, { kind: "folder", folder: "drafts" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Filed"])
  })

  it("gathers a tag from wherever it was written, matching case-insensitively", () => {
    const tagged = [
      note({ title: "One", tags: ["Writing"] }),
      note({ title: "Two", section: "journal", tags: ["writing"] }),
      note({ title: "Three", tags: ["reading"] })
    ]
    const got = indexNotes(tagged, { kind: "tag", tag: "writing" }, "title")
    expect(got.map((n) => n.title)).toEqual(["One", "Two"])
  })

  it("leaves trashed notes out of a tag", () => {
    const tagged = [
      note({ title: "Kept", tags: ["writing"] }),
      note({ title: "Binned", section: "trash", tags: ["writing"], deletedAt: 1 })
    ]
    const got = indexNotes(tagged, { kind: "tag", tag: "writing" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Kept"])
  })

  it("lists a trashed note under Trash, where it does belong", () => {
    const binned = [note({ title: "Binned", section: "trash", deletedAt: 1 })]
    const got = indexNotes(binned, { kind: "section", section: "trash" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Binned"])
  })
})

describe("tagCounts", () => {
  it("counts each tag once per note, most-used first", () => {
    const notes = [
      note({ title: "One", tags: ["writing", "life"] }),
      note({ title: "Two", tags: ["writing"] }),
      note({ title: "Three", tags: ["writing"] })
    ]
    expect(tagCounts(notes)).toEqual([
      { tag: "writing", count: 3 },
      { tag: "life", count: 1 }
    ])
  })

  it("folds case together, keeping the spelling it first saw", () => {
    const notes = [
      note({ title: "One", tags: ["Writing"] }),
      note({ title: "Two", tags: ["writing"] })
    ]
    expect(tagCounts(notes)).toEqual([{ tag: "Writing", count: 2 }])
  })

  it("ignores tags that only survive in the trash", () => {
    const notes = [note({ title: "Binned", section: "trash", tags: ["gone"], deletedAt: 1 })]
    expect(tagCounts(notes)).toEqual([])
  })
})

describe("search", () => {
  const notes = [
    note({ title: "Slow Morning", tags: ["writing"] }),
    note({ title: "Fast Evening" }),
    note({ title: "Elsewhere", tags: ["Morning-pages"] }),
    note({ title: "Morning Binned", section: "trash", deletedAt: 1 })
  ]

  it("matches a title, whatever the case", () => {
    const got = indexNotes(notes, { kind: "search", query: "morn" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Elsewhere", "Slow Morning"])
  })

  it("matches a tag too", () => {
    const got = indexNotes(notes, { kind: "search", query: "writing" }, "title")
    expect(got.map((n) => n.title)).toEqual(["Slow Morning"])
  })

  it("leaves the trash out of it", () => {
    const got = indexNotes(notes, { kind: "search", query: "binned" }, "title")
    expect(got).toEqual([])
  })

  it("finds nothing for an empty query rather than everything", () => {
    expect(indexNotes(notes, { kind: "search", query: "  " }, "title")).toEqual([])
  })

  it("quotes the query as its title", () => {
    expect(indexTitle({ kind: "search", query: "morning" }, DEFAULT_SECTIONS)).toBe("“morning”")
  })
})

describe("headings follow the rail", () => {
  const renamed = [
    {
      id: "ideas",
      kind: "section" as const,
      label: "Thoughts",
      icon: "ideas" as const,
      enabled: true
    },
    {
      id: "markmcdermott.io",
      kind: "blog" as const,
      label: "Writing",
      icon: "posts" as const,
      enabled: true
    }
  ]

  it("names a renamed section by its new name", () => {
    expect(indexTitle({ kind: "section", section: "ideas" }, renamed)).toBe("Thoughts")
  })

  it("names a renamed blog by its new name rather than its handle", () => {
    expect(indexTitle({ kind: "blog", blog: "markmcdermott.io" }, renamed)).toBe("Writing")
  })

  it("leaves a folder and a tag alone, which name themselves", () => {
    expect(indexTitle({ kind: "folder", folder: "ideas" }, renamed)).toBe("ideas")
    expect(indexTitle({ kind: "tag", tag: "writing" }, renamed)).toBe("#writing")
  })
})

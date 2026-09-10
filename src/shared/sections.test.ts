import { describe, it, expect } from "vitest"
import {
  DEFAULT_SECTIONS,
  SectionConfig,
  addSection,
  canDelete,
  sectionRole,
  moveSection,
  normalizeSections,
  removeSection,
  renameSection,
  railKey,
  railLabel,
  reconcileBlogs,
  sectionId,
  setSectionIcon,
  toggleSection,
  visibleSections
} from "./sections"

const ids = (sections: { id: string }[]) => sections.map((section) => section.id)

const section = (id: string): SectionConfig => ({
  id,
  kind: "section",
  label: id,
  icon: "folder",
  enabled: true
})

describe("what may be changed", () => {
  it("keeps Daily and Trash, since neither has anywhere else to go", () => {
    expect(canDelete(section("daily"))).toBe(false)
    expect(canDelete(section("trash"))).toBe(false)
  })

  it("lets everything else be removed", () => {
    for (const id of ["notes", "ideas", "journal", "recipes"]) {
      expect(canDelete(section(id))).toBe(true)
    }
  })

  it("says what the two kept sections are for, so a rename does not hide it", () => {
    expect(sectionRole(section("daily"))).not.toBeNull()
    expect(sectionRole(section("trash"))).not.toBeNull()
    expect(sectionRole(section("notes"))).toBeNull()
  })

  it("renames Daily, because the label is not what the scheduler uses", () => {
    // The id is the directory; only the label moves.
    const renamed = renameSection(DEFAULT_SECTIONS, "daily", "Journal of Days")
    const daily = renamed.find((section) => section.id === "daily")

    expect(daily?.label).toBe("Journal of Days")
    expect(daily?.id).toBe("daily")
  })

  it("hides Daily and Trash when asked", () => {
    for (const id of ["daily", "trash"]) {
      const hidden = toggleSection(DEFAULT_SECTIONS, id)
      expect(hidden.find((section) => section.id === id)?.enabled).toBe(false)
    }
  })

  it("moves Daily like any other section", () => {
    // Down, since Daily leads the default rail — up would be a no-op and prove
    // nothing about whether it may move.
    const moved = moveSection(DEFAULT_SECTIONS, "daily", 1)
    expect(ids(moved)).toEqual(["notes", "daily", "ideas", "journal", "trash"])
  })

  it("lets a section move across Daily rather than being blocked by it", () => {
    // Daily used to be a wall: nothing could pass it in either direction.
    const moved = moveSection(DEFAULT_SECTIONS, "notes", -1)
    expect(ids(moved)).toEqual(["notes", "daily", "ideas", "journal", "trash"])
  })
})

describe("sectionId", () => {
  it("makes a directory name out of a label", () => {
    expect(sectionId("Reading List")).toBe("reading-list")
    expect(sectionId("  Ideas!  ")).toBe("ideas")
  })

  it("refuses anything that could climb a path", () => {
    expect(sectionId("../escape")).toBe("escape")
    expect(sectionId("..")).toBeNull()
    expect(sectionId("   ")).toBeNull()
    expect(sectionId("///")).toBeNull()
  })
})

describe("addSection", () => {
  it("adds above Trash, which belongs at the bottom", () => {
    const next = addSection(DEFAULT_SECTIONS, "Reading")
    expect(ids(next!).slice(-2)).toEqual(["reading", "trash"])
  })

  it("refuses a name already taken", () => {
    expect(addSection(DEFAULT_SECTIONS, "Ideas")).toBeNull()
  })

  it("refuses a name the app reserves for itself", () => {
    expect(addSection(DEFAULT_SECTIONS, "Posts")).toBeNull()
  })

  it("refuses a name that is not a name", () => {
    expect(addSection(DEFAULT_SECTIONS, "  ")).toBeNull()
  })
})

describe("renameSection", () => {
  it("changes the label and leaves the id alone", () => {
    // The id is the directory: renaming must not move a single file.
    const next = renameSection(DEFAULT_SECTIONS, "ideas", "Sparks")
    const ideas = next.find((section) => section.id === "ideas")

    expect(ideas?.label).toBe("Sparks")
    expect(ids(next)).toEqual(ids(DEFAULT_SECTIONS))
  })

  it("renames Daily like anything else — only the label moves", () => {
    const next = renameSection(DEFAULT_SECTIONS, "daily", "Journal-ish")
    const daily = next.find((section) => section.id === "daily")

    expect(daily?.label).toBe("Journal-ish")
    // The id is the directory the scheduler writes into, and it is untouched.
    expect(daily?.id).toBe("daily")
  })

  it("ignores an empty name", () => {
    const next = renameSection(DEFAULT_SECTIONS, "ideas", "   ")
    expect(next.find((section) => section.id === "ideas")?.label).toBe("Ideas")
  })
})

describe("setSectionIcon", () => {
  it("changes an icon", () => {
    const next = setSectionIcon(DEFAULT_SECTIONS, "ideas", "star")
    expect(next.find((section) => section.id === "ideas")?.icon).toBe("star")
  })

  it("changes Daily's too", () => {
    const next = setSectionIcon(DEFAULT_SECTIONS, "daily", "star")
    expect(next.find((section) => section.id === "daily")?.icon).toBe("star")
  })
})

describe("toggleSection", () => {
  it("hides a section without removing it", () => {
    const next = toggleSection(DEFAULT_SECTIONS, "ideas")

    expect(next.find((section) => section.id === "ideas")?.enabled).toBe(false)
    expect(ids(next)).toEqual(ids(DEFAULT_SECTIONS))
    expect(ids(visibleSections(next))).not.toContain("ideas")
  })

  it("hides Daily and Trash when asked", () => {
    // Hiding takes them out of the rail and nothing else: daily notes are still
    // made, deleted notes still land in trash, and search still finds both.
    for (const id of ["daily", "trash"]) {
      const next = toggleSection(DEFAULT_SECTIONS, id)
      expect(next.find((section) => section.id === id)?.enabled).toBe(false)
    }
  })
})

describe("removeSection", () => {
  it("removes an ordinary section", () => {
    expect(ids(removeSection(DEFAULT_SECTIONS, "ideas"))).not.toContain("ideas")
  })

  it("refuses to remove Daily or Trash", () => {
    expect(removeSection(DEFAULT_SECTIONS, "daily")).toEqual(DEFAULT_SECTIONS)
    expect(removeSection(DEFAULT_SECTIONS, "trash")).toEqual(DEFAULT_SECTIONS)
  })
})

describe("moveSection", () => {
  it("moves a section up", () => {
    const next = moveSection(DEFAULT_SECTIONS, "journal", -1)
    expect(ids(next)).toEqual(["daily", "notes", "journal", "ideas", "trash"])
  })

  it("moves a section down", () => {
    const next = moveSection(DEFAULT_SECTIONS, "ideas", 1)
    expect(ids(next)).toEqual(["daily", "notes", "journal", "ideas", "trash"])
  })

  it("moves Daily", () => {
    expect(ids(moveSection(DEFAULT_SECTIONS, "daily", 1))).toEqual([
      "notes",
      "daily",
      "ideas",
      "journal",
      "trash"
    ])
  })

  it("lets a section pass Daily rather than stopping at it", () => {
    // Daily used to be a wall in both directions.
    expect(ids(moveSection(DEFAULT_SECTIONS, "notes", -1))).toEqual([
      "notes",
      "daily",
      "ideas",
      "journal",
      "trash"
    ])
  })

  it("stops at the ends rather than wrapping", () => {
    expect(moveSection(DEFAULT_SECTIONS, "daily", -1)).toEqual(DEFAULT_SECTIONS)
    expect(moveSection(DEFAULT_SECTIONS, "trash", 1)).toEqual(DEFAULT_SECTIONS)
  })
})

describe("normalizeSections", () => {
  it("gives the defaults for a file that has none", () => {
    expect(normalizeSections(undefined)).toEqual(DEFAULT_SECTIONS)
  })

  it("keeps what was stored, in the order it was stored", () => {
    const stored = [
      { id: "trash", label: "Bin", icon: "trash", enabled: true },
      { id: "notes", label: "Writing", icon: "notes", enabled: true }
    ]
    const next = normalizeSections(stored)

    expect(ids(next).slice(0, 2)).toEqual(["trash", "notes"])
    expect(next[0].label).toBe("Bin")
  })

  it("adds a section the app has since gained rather than losing it", () => {
    const next = normalizeSections([{ id: "notes", label: "Notes", icon: "notes", enabled: true }])
    expect(ids(next)).toContain("journal")
  })

  it("keeps a section the app no longer ships, whose notes may still exist", () => {
    const next = normalizeSections([
      { id: "archive", label: "Archive", icon: "folder", enabled: true }
    ])
    expect(ids(next)).toContain("archive")
  })

  it("drops an entry whose id could climb a path", () => {
    expect(ids(normalizeSections([{ id: "../etc", label: "x", icon: "folder" }]))).not.toContain(
      "../etc"
    )
  })

  it("keeps Daily and Trash hidden if that is what the file says", () => {
    const next = normalizeSections([
      { id: "daily", label: "Daily", icon: "daily", enabled: false },
      { id: "trash", label: "Trash", icon: "trash", enabled: false }
    ])

    expect(next.find((section) => section.id === "daily")?.enabled).toBe(false)
    expect(next.find((section) => section.id === "trash")?.enabled).toBe(false)
  })

  it("falls back to a known label and icon for a damaged entry", () => {
    const next = normalizeSections([{ id: "ideas", label: 42, icon: "nonsense" }])
    const ideas = next.find((section) => section.id === "ideas")

    expect(ideas?.label).toBe("Ideas")
    expect(ideas?.icon).toBe("ideas")
  })
})

describe("blogs in the rail", () => {
  const blogs = [{ name: "markmcdermott.io" }, { name: "notes" }]

  it("keeps blog names and section ids in separate namespaces", () => {
    // A blog may legitimately be called "notes". Keyed by id alone the two
    // would be the same row, and editing one would edit the other.
    const rail = reconcileBlogs(DEFAULT_SECTIONS, [{ name: "notes" }])
    const keys = rail.map(railKey)

    expect(keys).toContain("blog:notes")
    expect(keys).toContain("notes")
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("shows a blog the moment it is configured, without being stored first", () => {
    const rail = reconcileBlogs(DEFAULT_SECTIONS, blogs)
    expect(rail.filter((entry) => entry.kind === "blog").map((entry) => entry.id)).toEqual([
      "markmcdermott.io",
      "notes"
    ])
  })

  it("drops the row when the blog is deleted, so no row outlives its blog", () => {
    const arranged = reconcileBlogs(DEFAULT_SECTIONS, blogs)
    const rail = reconcileBlogs(arranged, [{ name: "markmcdermott.io" }])

    expect(rail.some((entry) => entry.kind === "blog" && entry.id === "notes")).toBe(false)
  })

  it("keeps where a blog was put, rather than sending it back to the top", () => {
    const arranged = moveSection(
      reconcileBlogs(DEFAULT_SECTIONS, [{ name: "markmcdermott.io" }]),
      "blog:markmcdermott.io",
      1
    )
    const again = reconcileBlogs(arranged, [{ name: "markmcdermott.io" }])

    expect(ids(again)).toEqual(["daily", "markmcdermott.io", "notes", "ideas", "journal", "trash"])
  })

  it("moves a blog past sections in both directions", () => {
    const rail = reconcileBlogs(DEFAULT_SECTIONS, [{ name: "markmcdermott.io" }])
    const down = moveSection(
      moveSection(rail, "blog:markmcdermott.io", 1),
      "blog:markmcdermott.io",
      1
    )

    expect(ids(down)).toEqual(["daily", "notes", "markmcdermott.io", "ideas", "journal", "trash"])
    expect(ids(moveSection(down, "blog:markmcdermott.io", -1))).toEqual(
      ids(moveSection(rail, "blog:markmcdermott.io", 1))
    )
  })

  it("renames and hides a blog without touching the section of the same name", () => {
    const rail = reconcileBlogs(DEFAULT_SECTIONS, [{ name: "notes" }])
    const edited = toggleSection(renameSection(rail, "blog:notes", "Writing"), "blog:notes")

    const blog = edited.find((entry) => entry.kind === "blog")
    const section = edited.find((entry) => entry.kind === "section" && entry.id === "notes")

    expect(blog?.label).toBe("Writing")
    expect(blog?.enabled).toBe(false)
    expect(section?.label).toBe("Notes")
    expect(section?.enabled).toBe(true)
  })

  it("refuses to delete a blog from the rail, since its tokens are not the rail's to drop", () => {
    const rail = reconcileBlogs(DEFAULT_SECTIONS, [{ name: "markmcdermott.io" }])
    const blog = rail.find((entry) => entry.kind === "blog")

    expect(blog).toBeDefined()
    expect(canDelete(blog as SectionConfig)).toBe(false)
    expect(removeSection(rail, "blog:markmcdermott.io")).toEqual(rail)
  })

  it("survives a round trip through storage, blog rows and all", () => {
    const rail = reconcileBlogs(DEFAULT_SECTIONS, [{ name: "markmcdermott.io" }])
    const arranged = moveSection(
      moveSection(rail, "blog:markmcdermott.io", 1),
      "blog:markmcdermott.io",
      1
    )
    const stored = normalizeSections(JSON.parse(JSON.stringify(arranged)))

    expect(stored).toEqual(arranged)
  })

  it("reads a rail stored before blogs were entries in it", () => {
    // Every stored row predates `kind`, so all of them are sections.
    const old = DEFAULT_SECTIONS.map(({ id, label, icon, enabled }) => ({
      id,
      label,
      icon,
      enabled
    }))

    expect(normalizeSections(old)).toEqual(DEFAULT_SECTIONS)
  })
})

describe("what a rail row is called", () => {
  const renamed: SectionConfig[] = [
    { id: "ideas", kind: "section", label: "Thoughts", icon: "ideas", enabled: true },
    { id: "markmcdermott.io", kind: "blog", label: "Writing", icon: "posts", enabled: true }
  ]

  it("gives a renamed section the reader's name for it", () => {
    expect(railLabel(renamed, "section", "ideas")).toBe("Thoughts")
  })

  it("gives a renamed blog the reader's name for it", () => {
    expect(railLabel(renamed, "blog", "markmcdermott.io")).toBe("Writing")
  })

  it("keeps the two namespaces apart", () => {
    const both: SectionConfig[] = [
      { id: "notes", kind: "section", label: "Notes", icon: "notes", enabled: true },
      { id: "notes", kind: "blog", label: "My Blog", icon: "posts", enabled: true }
    ]

    expect(railLabel(both, "section", "notes")).toBe("Notes")
    expect(railLabel(both, "blog", "notes")).toBe("My Blog")
  })

  it("names Posts, which the rail never holds", () => {
    // A post with no blog folder still has to say where it lives.
    expect(railLabel(DEFAULT_SECTIONS, "section", "posts")).toBe("Posts")
  })

  it("falls back to the id rather than drawing nothing", () => {
    expect(railLabel(DEFAULT_SECTIONS, "blog", "gone.example")).toBe("gone.example")
  })

  it("still names a row the reader has hidden", () => {
    // Hiding takes a row out of the rail, not out of the vault — its notes are
    // still reachable by search, and their breadcrumb still has to read.
    const hidden = toggleSection(DEFAULT_SECTIONS, "ideas")
    expect(railLabel(hidden, "section", "ideas")).toBe("Ideas")
  })
})

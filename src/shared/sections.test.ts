import { describe, it, expect } from "vitest"
import {
  DEFAULT_SECTIONS,
  addSection,
  canDelete,
  sectionRole,
  moveSection,
  normalizeSections,
  removeSection,
  renameSection,
  sectionId,
  setSectionIcon,
  toggleSection,
  visibleSections
} from "./sections"

const ids = (sections: { id: string }[]) => sections.map((section) => section.id)

describe("what may be changed", () => {
  it("keeps Daily and Trash, since neither has anywhere else to go", () => {
    expect(canDelete("daily")).toBe(false)
    expect(canDelete("trash")).toBe(false)
  })

  it("lets everything else be removed", () => {
    for (const id of ["notes", "ideas", "journal", "recipes"]) {
      expect(canDelete(id)).toBe(true)
    }
  })

  it("says what the two kept sections are for, so a rename does not hide it", () => {
    expect(sectionRole("daily")).not.toBeNull()
    expect(sectionRole("trash")).not.toBeNull()
    expect(sectionRole("notes")).toBeNull()
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
    const moved = moveSection(DEFAULT_SECTIONS, "daily", -1)
    expect(ids(moved)).toEqual(["daily", "notes", "ideas", "journal", "trash"])
  })

  it("lets a section move across Daily rather than being blocked by it", () => {
    // Daily used to be a wall: nothing could pass it in either direction.
    const moved = moveSection(DEFAULT_SECTIONS, "ideas", -1)
    expect(ids(moved)).toEqual(["notes", "ideas", "daily", "journal", "trash"])
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
    expect(ids(next)).toEqual(["notes", "daily", "journal", "ideas", "trash"])
  })

  it("moves a section down", () => {
    const next = moveSection(DEFAULT_SECTIONS, "ideas", 1)
    expect(ids(next)).toEqual(["notes", "daily", "journal", "ideas", "trash"])
  })

  it("moves Daily", () => {
    expect(ids(moveSection(DEFAULT_SECTIONS, "daily", -1))).toEqual([
      "daily",
      "notes",
      "ideas",
      "journal",
      "trash"
    ])
  })

  it("lets a section pass Daily rather than stopping at it", () => {
    // Daily used to be a wall in both directions.
    expect(ids(moveSection(DEFAULT_SECTIONS, "notes", 1))).toEqual([
      "daily",
      "notes",
      "ideas",
      "journal",
      "trash"
    ])
  })

  it("stops at the ends rather than wrapping", () => {
    expect(moveSection(DEFAULT_SECTIONS, "notes", -1)).toEqual(DEFAULT_SECTIONS)
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
    const next = normalizeSections([{ id: "archive", label: "Archive", icon: "folder", enabled: true }])
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

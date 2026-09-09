import { describe, it, expect } from "vitest"
import {
  DEFAULT_SECTIONS,
  addSection,
  canDelete,
  canDisable,
  canRename,
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
  it("leaves Daily alone", () => {
    // Its notes are one a day, named by date and made for the reader.
    expect(canRename("daily")).toBe(false)
    expect(canDelete("daily")).toBe(false)
    expect(canDisable("daily")).toBe(false)
  })

  it("keeps Trash, but lets it be renamed and moved", () => {
    // Deleted notes need somewhere to go.
    expect(canDelete("trash")).toBe(false)
    expect(canDisable("trash")).toBe(false)
    expect(canRename("trash")).toBe(true)
  })

  it("lets everything else be changed", () => {
    for (const id of ["notes", "ideas", "journal", "recipes"]) {
      expect(canRename(id)).toBe(true)
      expect(canDelete(id)).toBe(true)
      expect(canDisable(id)).toBe(true)
    }
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

  it("refuses to rename Daily", () => {
    const next = renameSection(DEFAULT_SECTIONS, "daily", "Journal-ish")
    expect(next.find((section) => section.id === "daily")?.label).toBe("Daily")
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

  it("leaves Daily's alone", () => {
    const next = setSectionIcon(DEFAULT_SECTIONS, "daily", "star")
    expect(next.find((section) => section.id === "daily")?.icon).toBe("daily")
  })
})

describe("toggleSection", () => {
  it("hides a section without removing it", () => {
    const next = toggleSection(DEFAULT_SECTIONS, "ideas")

    expect(next.find((section) => section.id === "ideas")?.enabled).toBe(false)
    expect(ids(next)).toEqual(ids(DEFAULT_SECTIONS))
    expect(ids(visibleSections(next))).not.toContain("ideas")
  })

  it("refuses to hide Daily or Trash", () => {
    expect(toggleSection(DEFAULT_SECTIONS, "daily")).toEqual(DEFAULT_SECTIONS)
    expect(toggleSection(DEFAULT_SECTIONS, "trash")).toEqual(DEFAULT_SECTIONS)
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

  it("will not move Daily", () => {
    expect(moveSection(DEFAULT_SECTIONS, "daily", -1)).toEqual(DEFAULT_SECTIONS)
  })

  it("will not shove Daily out of the way either", () => {
    // Notes sits above Daily; moving it down would displace the fixed row.
    expect(moveSection(DEFAULT_SECTIONS, "notes", 1)).toEqual(DEFAULT_SECTIONS)
    expect(moveSection(DEFAULT_SECTIONS, "ideas", -1)).toEqual(DEFAULT_SECTIONS)
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

  it("turns Daily and Trash back on however the file was edited", () => {
    const next = normalizeSections([
      { id: "daily", label: "Daily", icon: "daily", enabled: false },
      { id: "trash", label: "Trash", icon: "trash", enabled: false }
    ])

    expect(next.find((section) => section.id === "daily")?.enabled).toBe(true)
    expect(next.find((section) => section.id === "trash")?.enabled).toBe(true)
  })

  it("falls back to a known label and icon for a damaged entry", () => {
    const next = normalizeSections([{ id: "ideas", label: 42, icon: "nonsense" }])
    const ideas = next.find((section) => section.id === "ideas")

    expect(ideas?.label).toBe("Ideas")
    expect(ideas?.icon).toBe("ideas")
  })
})

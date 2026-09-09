/**
 * The sidebar's sections, as configuration rather than a fixed list.
 *
 * `id` is the directory in the vault and the first segment of every note id
 * inside it, so it never changes — renaming a section rewrites its label and
 * touches no files at all. That separation is what makes renaming safe.
 */

export const SECTION_ICONS = [
  "notes",
  "daily",
  "ideas",
  "journal",
  "posts",
  "trash",
  "folder",
  "tag",
  "star"
] as const

export type SectionIcon = (typeof SECTION_ICONS)[number]

export interface SectionConfig {
  id: string
  label: string
  icon: SectionIcon
  /** Hidden from the sidebar. Its notes stay on disk and still turn up in search. */
  enabled: boolean
}

/**
 * Two sections cannot be removed. Daily's notes are made for the reader, one a
 * day, and Trash is where deleting a note puts it — neither has anywhere else
 * to go. Everything else about them is the reader's: both can be renamed,
 * moved and hidden like any other section.
 *
 * That works because a section's id is its directory and never changes. Daily
 * can be called anything and the scheduler still writes into `daily/`; hiding
 * it stops it appearing in the rail and stops nothing else — the notes are
 * still made, still on disk, still found by search.
 *
 * Posts belongs to the blogs that sync into it and is not listed here at all.
 */
export const UNDELETABLE = ["daily", "trash"] as const

export const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: "notes", label: "Notes", icon: "notes", enabled: true },
  { id: "daily", label: "Daily", icon: "daily", enabled: true },
  { id: "ideas", label: "Ideas", icon: "ideas", enabled: true },
  { id: "journal", label: "Journal", icon: "journal", enabled: true },
  { id: "trash", label: "Trash", icon: "trash", enabled: true }
]

export function canDelete(id: string): boolean {
  return !(UNDELETABLE as readonly string[]).includes(id)
}

/**
 * True for the sections the app gives meaning to beyond being a folder, so the
 * manager can say which one is which once it has been renamed to something
 * else entirely.
 */
export function sectionRole(id: string): string | null {
  if (id === "daily") return "today's note, made for you"
  if (id === "trash") return "where deleted notes go"
  return null
}

/** A directory name: lowercase, no spaces, nothing that could climb a path. */
export function sectionId(label: string): string | null {
  const id = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null
}

/** Reserved because the app gives them meaning of its own. */
const RESERVED = ["posts", "daily", "trash"]

export function addSection(
  sections: SectionConfig[],
  label: string,
  icon: SectionIcon = "folder"
): SectionConfig[] | null {
  const id = sectionId(label)
  if (id === null) return null
  if (RESERVED.includes(id) || sections.some((section) => section.id === id)) return null

  // Above Trash, which belongs at the bottom of the list wherever it sits.
  const trash = sections.findIndex((section) => section.id === "trash")
  const next = [...sections]
  const made: SectionConfig = { id, label: label.trim(), icon, enabled: true }

  next.splice(trash === -1 ? next.length : trash, 0, made)
  return next
}

export function renameSection(
  sections: SectionConfig[],
  id: string,
  label: string
): SectionConfig[] {
  if (label.trim() === "") return sections
  return sections.map((section) =>
    section.id === id ? { ...section, label: label.trim() } : section
  )
}

export function setSectionIcon(
  sections: SectionConfig[],
  id: string,
  icon: SectionIcon
): SectionConfig[] {
  return sections.map((section) => (section.id === id ? { ...section, icon } : section))
}

export function toggleSection(sections: SectionConfig[], id: string): SectionConfig[] {
  return sections.map((section) =>
    section.id === id ? { ...section, enabled: !section.enabled } : section
  )
}

export function removeSection(sections: SectionConfig[], id: string): SectionConfig[] {
  if (!canDelete(id)) return sections
  return sections.filter((section) => section.id !== id)
}

/** Moves a section one place. Every section may move, including Daily. */
export function moveSection(
  sections: SectionConfig[],
  id: string,
  direction: -1 | 1
): SectionConfig[] {
  const from = sections.findIndex((section) => section.id === id)
  const to = from + direction
  if (from === -1 || to < 0 || to >= sections.length) return sections

  const next = [...sections]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** What the sidebar draws. */
export function visibleSections(sections: SectionConfig[]): SectionConfig[] {
  return sections.filter((section) => section.enabled)
}

/**
 * What a stored list becomes once it has been checked. A section the app has
 * since added arrives on the end rather than going missing, and a stored entry
 * the app no longer knows is kept — its directory may still hold notes.
 */
export function normalizeSections(value: unknown): SectionConfig[] {
  const stored = Array.isArray(value) ? value : []
  const seen = new Map<string, SectionConfig>()

  for (const entry of stored) {
    if (typeof entry !== "object" || entry === null) continue
    const raw = entry as Record<string, unknown>
    const id = typeof raw.id === "string" ? raw.id : ""
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || seen.has(id)) continue

    const fallback = DEFAULT_SECTIONS.find((section) => section.id === id)
    seen.set(id, {
      id,
      label:
        typeof raw.label === "string" && raw.label.trim() !== ""
          ? raw.label.trim().slice(0, 40)
          : (fallback?.label ?? id),
      icon: SECTION_ICONS.includes(raw.icon as SectionIcon)
        ? (raw.icon as SectionIcon)
        : (fallback?.icon ?? "folder"),
      enabled: raw.enabled !== false
    })
  }

  for (const section of DEFAULT_SECTIONS) {
    if (!seen.has(section.id)) seen.set(section.id, { ...section })
  }

  return [...seen.values()]
}

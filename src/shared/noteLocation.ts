import { Section, isSection, NoteSummary } from "./types"
import { FrontMatterValue } from "./frontMatter"

export interface NoteLocation {
  section: Section
  /** Single folder under Notes; null everywhere else. */
  folder: string | null
  filename: string
}

export function toNoteId({ section, folder, filename }: NoteLocation): string {
  return folder === null ? `${section}/${filename}` : `${section}/${folder}/${filename}`
}

/**
 * Parses a vault-relative note id, rejecting anything that could point outside
 * the vault or nest deeper than the one folder level Tova supports. Returning
 * null rather than throwing keeps the IPC layer's validation straightforward.
 */
export function parseNoteId(id: string): NoteLocation | null {
  if (id === "" || id.startsWith("/") || id.includes("\\") || id.includes("\0")) return null

  const parts = id.split("/")
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null
  if (parts.length < 2 || parts.length > 3) return null

  const [section, ...rest] = parts
  if (!isSection(section)) return null

  const filename = rest[rest.length - 1]
  if (!filename.endsWith(".md")) return null

  const folder = rest.length === 2 ? rest[0] : null
  // Only Notes has folders — Daily and Trash are flat.
  if (folder !== null && section !== "notes") return null

  return { section, folder, filename }
}

export function isValidFolderName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed === "" || trimmed === "." || trimmed === "..") return false
  return !/[/\\\0]/.test(trimmed)
}

/** Trash is flat: a note keeps its filename but loses its folder on the way in. */
export function trashLocation(filename: string): NoteLocation {
  return { section: "trash", folder: null, filename }
}

/**
 * Where a trashed note goes when restored. The original section and folder are
 * carried in front matter, so a note restores to where it was deleted from —
 * falling back to the Notes root if that metadata is missing or nonsensical.
 */
export function restoreLocation(
  data: Record<string, FrontMatterValue>,
  filename: string
): NoteLocation {
  const recorded = data.section
  const section: Section =
    typeof recorded === "string" && isSection(recorded) && recorded !== "trash" ? recorded : "notes"

  const recordedFolder = data.folder
  const folder =
    section === "notes" && typeof recordedFolder === "string" && isValidFolderName(recordedFolder)
      ? recordedFolder.trim()
      : null

  return { section, folder, filename }
}

/** Most recently touched first, with title as a stable tie-break. */
export function sortNotes(notes: NoteSummary[]): NoteSummary[] {
  return [...notes].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
    return a.title.localeCompare(b.title)
  })
}

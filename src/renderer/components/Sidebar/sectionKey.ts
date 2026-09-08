import { Note, NoteSummary } from "../../../shared/types"

/**
 * The sidebar key of whatever directly holds a note: the folder it sits in, the
 * blog it was synced from, or the section itself. Used to mark where the reader
 * currently is, which is one place rather than every ancestor of it.
 */
export function containerKeyOf(note: Note | NoteSummary | null): string | null {
  if (note === null) return null
  if (note.folder === null) return note.section
  return note.section === "posts" ? `blog:${note.folder}` : `folder:${note.folder}`
}

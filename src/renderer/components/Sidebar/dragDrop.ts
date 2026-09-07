import { NoteSummary } from "../../../shared/types"

export type DropTarget =
  | { kind: "folder"; folder: string }
  | { kind: "notesRoot" }
  | { kind: "trash" }
  | { kind: "daily" }

/** The MIME type the sidebar uses to carry a note id between rows. */
export const NOTE_MIME = "application/x-tova-note"

/**
 * Whether a note may be dropped on a target. Deliberately conservative: a daily
 * note's filename is its date, so moving it into the notes tree would strip the
 * meaning out of it, and Daily accepts nothing at all.
 */
export function canDrop(note: NoteSummary, target: DropTarget): boolean {
  switch (target.kind) {
    case "daily":
      return false

    case "trash":
      return note.section !== "trash"

    case "folder":
      // Dropping a note where it already lives is a no-op, not a move.
      return note.section === "notes" && note.folder !== target.folder

    case "notesRoot":
      return note.section === "notes" && note.folder !== null
  }
}

export function describeDrop(note: NoteSummary, target: DropTarget): string | null {
  if (!canDrop(note, target)) return null

  switch (target.kind) {
    case "trash":
      return `Move ${note.title || "note"} to Trash`
    case "folder":
      return `Move ${note.title || "note"} to ${target.folder}`
    case "notesRoot":
      return `Move ${note.title || "note"} out of ${note.folder}`
    default:
      return null
  }
}

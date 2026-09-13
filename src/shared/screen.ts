import { IndexTarget } from "./indexTarget"

/**
 * A place the reader can be: a note, or a listing.
 *
 * Shared rather than kept with the history that uses it, because main writes
 * one to disk between launches and has to be able to check what it reads back.
 */
export type Screen =
  | { kind: "note"; noteId: string }
  | { kind: "index"; target: IndexTarget }
  /** The page behind the wordmark. It holds nothing, which is the point. */
  | { kind: "home" }

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/**
 * What a stored screen becomes once it has been checked, or null when it is
 * not one. Anything unrecognised falls back to the note Tova would have opened
 * anyway, so a hand-edited or half-written file costs a launch and nothing more.
 *
 * A search is deliberately not restorable. Its results were read from the vault
 * as it stood, and reopening the query hours later would show a page that looks
 * remembered and is not.
 */
export function normalizeScreen(value: unknown): Screen | null {
  if (typeof value !== "object" || value === null) return null
  const raw = value as Record<string, unknown>

  if (raw.kind === "home") return { kind: "home" }

  if (raw.kind === "note") {
    const noteId = text(raw.noteId)
    // The vault's own guard rejects a path that climbs; this only has to stop
    // an obvious one reaching it.
    return noteId !== null && !noteId.includes("..") ? { kind: "note", noteId } : null
  }

  if (raw.kind !== "index") return null
  const target = raw.target
  if (typeof target !== "object" || target === null) return null

  const inner = target as Record<string, unknown>
  switch (inner.kind) {
    case "section": {
      const section = text(inner.section)
      return section === null ? null : { kind: "index", target: { kind: "section", section } }
    }
    case "folder": {
      const folder = text(inner.folder)
      return folder === null ? null : { kind: "index", target: { kind: "folder", folder } }
    }
    case "blog": {
      const blog = text(inner.blog)
      return blog === null ? null : { kind: "index", target: { kind: "blog", blog } }
    }
    case "tag": {
      const tag = text(inner.tag)
      return tag === null ? null : { kind: "index", target: { kind: "tag", tag } }
    }
    case "tags":
      return { kind: "index", target: { kind: "tags" } }
    default:
      return null
  }
}

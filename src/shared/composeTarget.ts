import { IndexTarget } from "./indexTarget"
import { NoteSummary, Section } from "./types"

/**
 * Where the compose button should write, given where the reader is. The button
 * follows the place you are standing in rather than always meaning Notes.
 *
 * Daily answers null: its notes are one per day and made for you. The caller
 * opens today's instead, which creates it if the day has none.
 */
export function composeTarget(
  view: "editor" | "settings" | "index",
  indexTarget: IndexTarget | null,
  active: NoteSummary | null
): { section: Section; folder: string | null } | null {
  if (view === "index" && indexTarget !== null) {
    switch (indexTarget.kind) {
      case "section":
        return indexTarget.section === "daily"
          ? null
          : // Trash and Posts are not places to start writing.
            indexTarget.section === "trash" || indexTarget.section === "posts"
            ? { section: "notes", folder: null }
            : { section: indexTarget.section, folder: null }
      case "folder":
        return { section: "notes", folder: indexTarget.folder }
      case "blog":
      case "tag":
      case "tags":
        return { section: "notes", folder: null }
    }
  }

  if (active !== null) {
    if (active.section === "daily") return null
    if (active.section === "trash" || active.section === "posts") {
      return { section: "notes", folder: null }
    }
    return { section: active.section, folder: active.folder }
  }

  return { section: "notes", folder: null }
}

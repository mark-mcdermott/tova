import { NoteSummary } from "../../../shared/types"

export interface Crumb {
  label: string
  /** Sidebar section key this crumb reveals, or null for the note itself. */
  target: string | null
}

const SECTION_LABELS: Record<NoteSummary["section"], string> = {
  notes: "Notes",
  daily: "Daily",
  trash: "Trash"
}

/**
 * Section / folder / title — at most three levels. The final crumb is the note
 * itself and is not a link; the rest reveal their section in the sidebar.
 */
export function breadcrumbFor(note: NoteSummary): Crumb[] {
  const crumbs: Crumb[] = [{ label: SECTION_LABELS[note.section], target: note.section }]

  if (note.section === "notes" && note.folder !== null) {
    crumbs.push({ label: note.folder, target: `folder:${note.folder}` })
  }

  crumbs.push({
    label: note.title.trim() === "" ? "Untitled" : note.title,
    target: null
  })

  return crumbs
}

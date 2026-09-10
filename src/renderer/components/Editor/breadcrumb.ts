import { NoteSummary } from "../../../shared/types"
import { SectionConfig, railLabel } from "../../../shared/sections"
import { IndexTarget } from "../../../shared/indexTarget"

export interface Crumb {
  label: string
  /** The listing this crumb opens, or null for the note itself — you are there. */
  target: IndexTarget | null
}

/**
 * Section / folder / title — at most three levels. The final crumb is the note
 * itself and is not a link; the rest open their listing.
 *
 * They used to reveal the row in the sidebar instead, which looked like a link,
 * read like a link, and left you on the same page.
 *
 * Named by the rail, so a section or blog renamed in Settings is renamed here.
 */
export function breadcrumbFor(note: NoteSummary, sections: SectionConfig[]): Crumb[] {
  // A synced post belongs to its blog, not to a generic Posts section — the
  // sidebar shows blogs as peers of Notes, and the crumb follows that.
  const crumbs: Crumb[] =
    note.section === "posts" && note.folder !== null
      ? [
          {
            label: railLabel(sections, "blog", note.folder),
            target: { kind: "blog", blog: note.folder }
          }
        ]
      : [
          {
            label: railLabel(sections, "section", note.section),
            target: { kind: "section", section: note.section }
          }
        ]

  if (note.section === "notes" && note.folder !== null) {
    crumbs.push({ label: note.folder, target: { kind: "folder", folder: note.folder } })
  }

  crumbs.push({
    label: note.title.trim() === "" ? "Untitled" : note.title,
    target: null
  })

  return crumbs
}

/**
 * Whether a trail is worth drawing at all.
 *
 * A lone crumb that only repeats the heading under it says nothing twice — the
 * index pages for Ideas, Journal and Trash each had "Ideas" above "Ideas". Two
 * or more crumbs always earn their place, even when the last one matches the
 * heading: "Notes / untitled-2" is saying where the note lives, not what it is
 * called.
 */
export function showsTrail(crumbs: { label: string }[], title: string): boolean {
  if (crumbs.length === 0) return false
  return crumbs.length > 1 || crumbs[0].label !== title
}

/**
 * The listing a note lives in — where to land when the note itself is no
 * longer somewhere to be. The same place the last linked crumb points at,
 * which is what the trail already says is one step up.
 */
export function noteHome(note: NoteSummary): IndexTarget {
  if (note.section === "posts" && note.folder !== null) {
    return { kind: "blog", blog: note.folder }
  }
  if (note.section === "notes" && note.folder !== null) {
    return { kind: "folder", folder: note.folder }
  }
  return { kind: "section", section: note.section }
}

import { NoteSummary, Section } from "./types"

/**
 * What an index page is showing. Clicking a section, a folder or a tag in the
 * sidebar opens one of these in the body rather than unfolding a list in the
 * rail — the sidebar stays a set of destinations, and the listing gets room to
 * be sorted and read.
 */
export type IndexTarget =
  | { kind: "section"; section: Section }
  | { kind: "folder"; folder: string }
  | { kind: "blog"; blog: string }
  | { kind: "tag"; tag: string }
  | { kind: "tags" }
  | { kind: "search"; query: string }

export type IndexSort = "relevance" | "title" | "created" | "updated"

export const INDEX_SORTS: { value: IndexSort; label: string }[] = [
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Created" },
  { value: "title", label: "Title" }
]

/** Search can also leave the ranking alone, which is usually what you want. */
export const SEARCH_SORTS: { value: IndexSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  ...INDEX_SORTS
]

const SECTION_LABELS: Record<Section, string> = {
  notes: "Notes",
  daily: "Daily",
  ideas: "Ideas",
  journal: "Journal",
  posts: "Posts",
  trash: "Trash"
}

export function indexTitle(target: IndexTarget): string {
  switch (target.kind) {
    case "section":
      return SECTION_LABELS[target.section]
    case "folder":
      return target.folder
    case "blog":
      return target.blog
    case "tag":
      return `#${target.tag}`
    case "tags":
      return "Tags"
    case "search":
      return `“${target.query}”`
  }
}

/** The sidebar key an index belongs to, so the rail can mark where you are. */
export function indexKey(target: IndexTarget): string {
  switch (target.kind) {
    case "section":
      return target.section
    case "folder":
      return `folder:${target.folder}`
    case "blog":
      return `blog:${target.blog}`
    case "tag":
      return `tag:${target.tag}`
    case "tags":
      return "tags"
    case "search":
      return "search"
  }
}

function held(notes: NoteSummary[], target: IndexTarget): NoteSummary[] {
  switch (target.kind) {
    case "section":
      // A section lists everything under it, folders included: the index is the
      // whole of that place, not just what happens to be loose in it.
      return notes.filter((note) => note.section === target.section)
    case "folder":
      return notes.filter((note) => note.section === "notes" && note.folder === target.folder)
    case "blog":
      return notes.filter((note) => note.section === "posts" && note.folder === target.blog)
    case "tag":
      return notes.filter(
        (note) =>
          note.section !== "trash" &&
          note.tags.some((tag) => tag.toLowerCase() === target.tag.toLowerCase())
      )
    case "tags":
      return []
    case "search": {
      // Titles and tags, not bodies: those live on disk and searching them
      // means reading every file. A body search is its own piece of work.
      const needle = target.query.trim().toLowerCase()
      if (needle === "") return []
      return notes.filter(
        (note) =>
          note.section !== "trash" &&
          (note.title.toLowerCase().includes(needle) ||
            note.tags.some((tag) => tag.toLowerCase().includes(needle)))
      )
    }
  }
}

function compare(a: NoteSummary, b: NoteSummary, sort: IndexSort): number {
  switch (sort) {
    case "relevance":
      // Only search ranks, and it arrives ranked. Anywhere else this is a
      // no-op rather than a wrong answer.
      return 0
    case "title":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    case "created":
      return b.createdAt - a.createdAt
    case "updated":
      return b.updatedAt - a.updatedAt
  }
}

/**
 * The notes an index shows, in order. Favourites sit at the top whatever the
 * sort, since that is what marking one is for; within each group the chosen
 * sort decides.
 */
export function indexNotes(
  notes: NoteSummary[],
  target: IndexTarget,
  sort: IndexSort
): NoteSummary[] {
  return [...held(notes, target)].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return compare(a, b, sort)
  })
}

export interface TagCount {
  tag: string
  count: number
}

/** Every tag in the vault with how many notes wear it, most-used first. */
export function tagCounts(notes: NoteSummary[]): TagCount[] {
  const counts = new Map<string, { tag: string; count: number }>()

  for (const note of notes) {
    if (note.section === "trash") continue
    for (const tag of note.tags) {
      const key = tag.toLowerCase()
      const seen = counts.get(key)
      if (seen === undefined) counts.set(key, { tag, count: 1 })
      else seen.count += 1
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" })
  )
}

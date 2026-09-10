/**
 * The sidebar's rail, as configuration rather than a fixed list.
 *
 * A rail entry is one of two things. A **section** is a directory in the vault:
 * its `id` is that directory and the first segment of every note id inside it,
 * so it never changes — renaming a section rewrites its label and touches no
 * files at all. A **blog** is a configured blog, keyed by its name; its posts
 * live under `posts/` and are synced rather than filed.
 *
 * Both are drawn from the same list, so a blog can sit anywhere in the rail
 * rather than in a fixed block above it. Blogs are not stored in preferences
 * until the reader arranges them: `reconcileBlogs` derives the entries from the
 * configured blogs at render time, and only an actual edit writes them down.
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
  /** A vault directory, or — for a blog — the blog's name. */
  id: string
  kind: "section" | "blog"
  label: string
  icon: SectionIcon
  /** Hidden from the sidebar. Its notes stay on disk and still turn up in search. */
  enabled: boolean
}

/**
 * A rail entry's identity. Blog names are not section ids — they can carry dots
 * and could otherwise collide with one — so the two namespaces are kept apart
 * here, in the same shape `containerKeyOf` already produces for the sidebar.
 */
export function railKey(entry: SectionConfig): string {
  return entry.kind === "blog" ? `blog:${entry.id}` : entry.id
}

/**
 * Two sections cannot be removed. Daily's notes are made for the reader, one a
 * day, and Trash is where deleting a note puts it — neither has anywhere else
 * to go. Everything else about them is the reader's: both can be renamed,
 * moved and hidden like any other entry.
 *
 * That works because a section's id is its directory and never changes. Daily
 * can be called anything and the scheduler still writes into `daily/`; hiding
 * it stops it appearing in the rail and stops nothing else — the notes are
 * still made, still on disk, still found by search.
 *
 * Blogs cannot be removed here either, for a different reason: this list
 * arranges the rail, and deleting a blog would take its stored tokens and its
 * sync history with it. That belongs in Settings → Blogs, which says so.
 */
export const UNDELETABLE = ["daily", "trash"] as const

export const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: "notes", kind: "section", label: "Notes", icon: "notes", enabled: true },
  { id: "daily", kind: "section", label: "Daily", icon: "daily", enabled: true },
  { id: "ideas", kind: "section", label: "Ideas", icon: "ideas", enabled: true },
  { id: "journal", kind: "section", label: "Journal", icon: "journal", enabled: true },
  { id: "trash", kind: "section", label: "Trash", icon: "trash", enabled: true }
]

/**
 * Whether a section's directory may be removed. Separate from `canDelete` so
 * main can check an id on its own: it is handed one by the renderer and does
 * not trust it, and has no rail entry to check against.
 */
export function canDeleteSection(id: string): boolean {
  return !(UNDELETABLE as readonly string[]).includes(id)
}

export function canDelete(entry: SectionConfig): boolean {
  if (entry.kind === "blog") return false
  return canDeleteSection(entry.id)
}

/**
 * True for the entries the app gives meaning to beyond being a folder, so the
 * manager can say which one is which once it has been renamed to something
 * else entirely — and, for the three that cannot be removed here, why not.
 */
export function sectionRole(entry: SectionConfig): string | null {
  if (entry.kind === "blog") return "a blog, managed in the Blogs tab"
  if (entry.id === "daily") return "today's note, made for you"
  if (entry.id === "trash") return "where deleted notes go"
  return null
}

/**
 * Sections the rail never holds, and so have no label of the reader's. Posts
 * belongs to the blogs that sync into it rather than being a row of its own.
 */
const UNLISTED_LABELS: Record<string, string> = { posts: "Posts" }

/**
 * What a rail entry is called. The one place a section id or a blog name turns
 * into words, so a renamed row reaches the index heading and the breadcrumb as
 * well as the rail — they each used to carry a hardcoded label of their own.
 */
export function railLabel(
  sections: SectionConfig[],
  kind: SectionConfig["kind"],
  id: string
): string {
  const entry = sections.find((section) => section.kind === kind && section.id === id)
  return entry?.label ?? UNLISTED_LABELS[id] ?? id
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
  if (RESERVED.includes(id)) return null
  if (sections.some((entry) => entry.kind === "section" && entry.id === id)) return null

  // Above Trash, which belongs at the bottom of the list wherever it sits.
  const trash = sections.findIndex((entry) => entry.kind === "section" && entry.id === "trash")
  const next = [...sections]
  const made: SectionConfig = { id, kind: "section", label: label.trim(), icon, enabled: true }

  next.splice(trash === -1 ? next.length : trash, 0, made)
  return next
}

function edit(
  sections: SectionConfig[],
  key: string,
  change: (entry: SectionConfig) => SectionConfig
): SectionConfig[] {
  return sections.map((entry) => (railKey(entry) === key ? change(entry) : entry))
}

export function renameSection(
  sections: SectionConfig[],
  key: string,
  label: string
): SectionConfig[] {
  if (label.trim() === "") return sections
  return edit(sections, key, (entry) => ({ ...entry, label: label.trim() }))
}

export function setSectionIcon(
  sections: SectionConfig[],
  key: string,
  icon: SectionIcon
): SectionConfig[] {
  return edit(sections, key, (entry) => ({ ...entry, icon }))
}

export function toggleSection(sections: SectionConfig[], key: string): SectionConfig[] {
  return edit(sections, key, (entry) => ({ ...entry, enabled: !entry.enabled }))
}

export function removeSection(sections: SectionConfig[], key: string): SectionConfig[] {
  const target = sections.find((entry) => railKey(entry) === key)
  if (target === undefined || !canDelete(target)) return sections
  return sections.filter((entry) => railKey(entry) !== key)
}

/** Moves an entry one place. Every entry may move, including Daily and blogs. */
export function moveSection(
  sections: SectionConfig[],
  key: string,
  direction: -1 | 1
): SectionConfig[] {
  const from = sections.findIndex((entry) => railKey(entry) === key)
  const to = from + direction
  if (from === -1 || to < 0 || to >= sections.length) return sections

  const next = [...sections]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** What the sidebar draws. */
export function visibleSections(sections: SectionConfig[]): SectionConfig[] {
  return sections.filter((entry) => entry.enabled)
}

/**
 * The stored rail, brought level with the blogs that are actually configured.
 *
 * A blog the reader has just added arrives at the top, which is where blogs sat
 * before the rail could hold them; one that has been deleted in the Blogs tab
 * takes its entry with it, so a stale row cannot outlive the blog it names.
 * Nothing here is persisted — that happens when the reader edits the rail — so
 * a blog that is only passing through never writes to preferences.
 */
export function reconcileBlogs(
  sections: SectionConfig[],
  blogs: { name: string }[]
): SectionConfig[] {
  const configured = new Set(blogs.map((blog) => blog.name))
  const kept = sections.filter((entry) => entry.kind !== "blog" || configured.has(entry.id))
  const known = new Set(kept.filter((entry) => entry.kind === "blog").map((entry) => entry.id))

  const added: SectionConfig[] = blogs
    .filter((blog) => !known.has(blog.name))
    .map((blog) => ({
      id: blog.name,
      kind: "blog",
      label: blog.name,
      icon: "posts",
      enabled: true
    }))

  return [...added, ...kept]
}

/**
 * What a stored list becomes once it has been checked. A section the app has
 * since added arrives on the end rather than going missing, and a stored entry
 * the app no longer knows is kept — its directory may still hold notes.
 *
 * Blog entries are kept as they are found. Whether the blog still exists is not
 * knowable here, because blogs live in the app's data directory rather than in
 * preferences; `reconcileBlogs` answers that where both are in hand.
 */
export function normalizeSections(value: unknown): SectionConfig[] {
  const stored = Array.isArray(value) ? value : []
  const seen = new Map<string, SectionConfig>()

  for (const entry of stored) {
    if (typeof entry !== "object" || entry === null) continue
    const raw = entry as Record<string, unknown>
    const id = typeof raw.id === "string" ? raw.id : ""
    const kind = raw.kind === "blog" ? "blog" : "section"

    // A blog is keyed by its name, which is only barred from carrying spaces;
    // a section id is a directory, and has to look like one.
    const valid = kind === "blog" ? id !== "" && !/\s/.test(id) : /^[a-z0-9][a-z0-9-]*$/.test(id)
    if (!valid) continue

    const made: SectionConfig = { id, kind, label: "", icon: "folder", enabled: true }
    if (seen.has(railKey(made))) continue

    const fallback = DEFAULT_SECTIONS.find((section) => section.kind === kind && section.id === id)

    seen.set(railKey(made), {
      id,
      kind,
      label:
        typeof raw.label === "string" && raw.label.trim() !== ""
          ? raw.label.trim().slice(0, 40)
          : (fallback?.label ?? id),
      icon: SECTION_ICONS.includes(raw.icon as SectionIcon)
        ? (raw.icon as SectionIcon)
        : (fallback?.icon ?? (kind === "blog" ? "posts" : "folder")),
      enabled: raw.enabled !== false
    })
  }

  for (const section of DEFAULT_SECTIONS) {
    if (!seen.has(railKey(section))) seen.set(railKey(section), { ...section })
  }

  return [...seen.values()]
}

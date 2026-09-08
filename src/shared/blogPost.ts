import { parseFrontMatter } from "./frontMatter"
import { slugify } from "./noteName"
import { padTwo } from "./date"

/**
 * Tova authors blog posts with `@` decorators rather than YAML, so a note stays
 * readable prose while it is being written. YAML only exists at the two edges:
 * a post imported from a repo is converted in, and a post being published is
 * converted out. The two conversions are inverses.
 */

export interface PostField {
  name: string
  /** Everything after `@name `, trimmed, with any outer double quotes removed. */
  value: string
  /** 0-based line in the document the field was read from. */
  line: number
}

export interface BlogPost {
  /** The name between `@` and ` post`, e.g. `markmcdermott.io`. */
  blog: string
  fields: PostField[]
  body: string
  /** 0-based line of the `@blog post` header. */
  headerLine: number
  /** 0-based line after the post's last line, exclusive. */
  endLine: number
}

const HEADER = /^@(\S+)[ \t]+post[ \t]*$/
const FIELD = /^@([A-Za-z][\w-]*)(?:[ \t]+(.*))?$/
const SEPARATOR = /^-{3,}[ \t]*$/
const SHORT_DATE = /^(\d{2})-(\d{2})-(\d{2})$/
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function unquote(value: string): string {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}

/** Reads every `@blog post` block in a document. Prose outside them is ignored. */
export function parsePosts(doc: string): BlogPost[] {
  const lines = doc.replace(/\r\n/g, "\n").split("\n")
  const posts: BlogPost[] = []

  for (let index = 0; index < lines.length; index++) {
    const header = HEADER.exec(lines[index])
    if (header === null) continue

    const fields: PostField[] = []
    let cursor = index + 1

    while (cursor < lines.length && HEADER.exec(lines[cursor]) === null) {
      const field = FIELD.exec(lines[cursor])
      if (field === null) break
      fields.push({ name: field[1], value: unquote(field[2] ?? ""), line: cursor })
      cursor++
    }

    const bodyStart = cursor
    while (
      cursor < lines.length &&
      !SEPARATOR.test(lines[cursor]) &&
      HEADER.exec(lines[cursor]) === null
    ) {
      cursor++
    }

    posts.push({
      blog: header[1],
      fields,
      body: lines.slice(bodyStart, cursor).join("\n").trim(),
      headerLine: index,
      // The `---` belongs to the post as its end marker; a following header
      // does not, so the next pass can pick it up.
      endLine: cursor < lines.length && SEPARATOR.test(lines[cursor]) ? cursor + 1 : cursor
    })

    index = cursor - 1
  }

  return posts
}

export function fieldValue(post: BlogPost, name: string): string | null {
  const field = post.fields.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
  return field === undefined ? null : field.value
}

/** `YY-MM-DD` is accepted and widened; anything else is left for the caller. */
export function normalizeDate(value: string): string | null {
  const short = SHORT_DATE.exec(value.trim())
  if (short !== null) return `20${short[1]}-${short[2]}-${short[3]}`
  return FULL_DATE.test(value.trim()) ? value.trim() : null
}

export function postDate(post: BlogPost, today: Date = new Date()): string {
  const declared = fieldValue(post, "date")
  const normalized = declared === null ? null : normalizeDate(declared)
  if (normalized !== null) return normalized

  return `${today.getFullYear()}-${padTwo(today.getMonth() + 1)}-${padTwo(today.getDate())}`
}

export function postTags(post: BlogPost): string[] {
  const raw = fieldValue(post, "tags")
  if (raw === null) return []
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "")
}

export function postSlug(post: BlogPost): string {
  const declared = fieldValue(post, "slug")
  if (declared !== null && declared.trim() !== "") return slugify(declared)
  return slugify(fieldValue(post, "title") ?? "")
}

/**
 * `YY-MM-DD-slug.md`. Computed from the post's own fields rather than from a
 * stored template — Xin shipped `{slug}.md` as a literal filename by storing
 * the template and interpolating too late.
 */
export function postFilename(post: BlogPost, today: Date = new Date()): string {
  const date = postDate(post, today)
  return `${date.slice(2)}-${postSlug(post)}.md`
}

/* ── YAML conversion ──────────────────────────────────────────────────── */

/** Astro quotes its strings; a value carrying a double quote takes single ones. */
function yamlString(value: string): string {
  return value.includes('"') ? `'${value.replace(/'/g, "''")}'` : `"${value}"`
}

const RESERVED = new Set(["title", "subtitle", "date", "tags", "slug"])

/**
 * `@` fields to the Astro front matter a repo expects. Unknown fields pass
 * through as quoted strings rather than being dropped, so a blog with its own
 * schema keeps working without Tova knowing about it.
 */
export function toYaml(post: BlogPost, today: Date = new Date()): string {
  const lines: string[] = []
  const title = fieldValue(post, "title")
  const subtitle = fieldValue(post, "subtitle")
  const slug = fieldValue(post, "slug")
  const tags = postTags(post)

  if (title !== null) lines.push(`title: ${yamlString(title)}`)
  if (subtitle !== null) lines.push(`subtitle: ${yamlString(subtitle)}`)
  lines.push(`date: "${postDate(post, today)}"`)
  if (tags.length > 0) {
    lines.push(`tags: [${tags.map((tag) => `"${tag.toLowerCase()}"`).join(", ")}]`)
  }
  if (slug !== null) lines.push(`slug: ${slug}`)

  for (const field of post.fields) {
    if (RESERVED.has(field.name.toLowerCase())) continue
    lines.push(`${field.name}: ${yamlString(field.value)}`)
  }

  return `---\n${lines.join("\n")}\n---\n\n${post.body}\n`
}

/**
 * The other direction: a post fetched from a repo becomes the `@` form the
 * editor shows. Field order follows the spec's example rather than the file's,
 * so imported posts read the same as ones written here.
 */
export function fromYaml(raw: string, blog: string): string {
  const { data, body } = parseFrontMatter(raw)
  const lines = [`@${blog} post`]

  const emit = (name: string, value: string): void => {
    if (value.trim() !== "") lines.push(`@${name} ${value}`)
  }

  const ordered = ["title", "subtitle", "date", "tags", "slug"]
  for (const name of ordered) {
    const value = data[name]
    if (value === undefined) continue
    emit(name, Array.isArray(value) ? value.join(", ") : value)
  }

  for (const [name, value] of Object.entries(data)) {
    if (ordered.includes(name)) continue
    emit(name, Array.isArray(value) ? value.join(", ") : value)
  }

  return `${lines.join("\n")}\n\n${body.trim()}\n`
}

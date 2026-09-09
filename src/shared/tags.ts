export interface TagMatch {
  tag: string
  from: number
  to: number
}

/**
 * A tag is `#` followed by a letter, then word characters or hyphens.
 * Requiring a leading letter keeps `# Heading` (hash + space) and `#1`
 * from being mistaken for tags.
 */
const TAG_PATTERN = /#[A-Za-z][\w-]*/g

export function findTags(text: string): TagMatch[] {
  const matches: TagMatch[] = []
  for (const match of text.matchAll(TAG_PATTERN)) {
    matches.push({
      tag: match[0].slice(1),
      from: match.index,
      to: match.index + match[0].length
    })
  }
  return matches
}

/** Unique tag names in first-seen order, deduped case-insensitively. */
export function extractTags(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const { tag } of findTags(text)) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

/**
 * True when a line holds nothing but tags and whitespace. These render as
 * light "top-zone" pills that stay visible regardless of cursor position.
 */
export function isTagOnlyLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === "") return false
  return trimmed.split(/\s+/).every((word) => /^#[A-Za-z][\w-]*$/.test(word))
}

/**
 * How many opening lines the tag row above the editor already accounts for:
 * the tags line, plus the blank line under it. Takes the note's first lines —
 * three are enough to decide.
 *
 * Never every line there is. A note whose whole text is its tags keeps them on
 * screen, since hiding the lot would leave a blank editor and no way to see
 * why.
 */
export function tagHeaderLines(lines: readonly string[]): number {
  if (lines.length < 2 || !isTagOnlyLine(lines[0])) return 0
  return lines.length > 2 && lines[1].trim() === "" ? 2 : 1
}

/** Where the prose starts, past any tags line the tag row is already showing. */
export function bodyStart(doc: string): number {
  const lines = doc.split("\n")
  const skip = tagHeaderLines(lines.slice(0, 3))

  let offset = 0
  for (let index = 0; index < skip; index++) offset += lines[index].length + 1
  return offset
}

export interface TagEdit {
  from: number
  to: number
  insert: string
}

/** A tag as it would be written: no hash, no spaces, and a letter to start. */
export function normalizeTag(input: string): string | null {
  const tag = input.trim().replace(/^#+/, "")
  return /^[A-Za-z][\w-]*$/.test(tag) ? tag : null
}

/**
 * Where a tag typed into the tag strip should land in the prose. Tags are
 * parsed out of the body rather than stored, so adding one means writing it
 * there — onto the leading tags-only line if the note already has one, and
 * onto a new first line if it does not.
 *
 * Returns null when there is nothing to do: an unusable name, or a tag the
 * note already carries anywhere in its text.
 */
export function addTagEdit(doc: string, input: string): TagEdit | null {
  const tag = normalizeTag(input)
  if (tag === null) return null

  const already = extractTags(doc).some((seen) => seen.toLowerCase() === tag.toLowerCase())
  if (already) return null

  const firstLine = doc.split("\n")[0] ?? ""
  if (isTagOnlyLine(firstLine)) {
    return { from: firstLine.length, to: firstLine.length, insert: ` #${tag}` }
  }

  // A blank note gets the line on its own; anything else keeps its first
  // paragraph, pushed down by the blank line between.
  return { from: 0, to: 0, insert: doc.trim() === "" ? `#${tag}\n` : `#${tag}\n\n` }
}

/**
 * Where the caret belongs after the tag row writes a tag in.
 *
 * Never inside the line just written: the tag row already shows that line, so
 * the editor hides it — and a caret inside keeps it revealed, which is the tag
 * appearing in two places at once. A caret already out in the prose is left
 * where the writer put it, only shifted by what was inserted above it.
 */
export function caretAfterTagEdit(doc: string, edit: TagEdit, head: number): number {
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
  const shift = edit.insert.length - (edit.to - edit.from)
  const moved = head >= edit.from ? head + shift : head

  return Math.max(moved, bodyStart(next))
}


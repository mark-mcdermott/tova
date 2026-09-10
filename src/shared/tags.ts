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
 * How many opening lines a leading tags line occupies: the tags line, plus the
 * blank line under it. Takes the note's first lines — three are enough to
 * decide. Used to place the caret past them, not to hide them: the line is
 * drawn like any other row of tags.
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
 * Never inside the line just written: you asked for a tag, not for somewhere
 * to type. A caret already out in the prose is left where the writer put it,
 * only shifted by what was inserted above it.
 */
export function caretAfterTagEdit(doc: string, edit: TagEdit, head: number): number {
  const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
  const shift = edit.insert.length - (edit.to - edit.from)
  const moved = head >= edit.from ? head + shift : head

  return Math.max(moved, bodyStart(next))
}

/**
 * Where a tag was written. The tag row always writes onto the leading tags-only
 * line, so position is the honest record of how a tag got here: one on that
 * line was asked for, one anywhere else came along with the prose.
 *
 * Nothing is stored for this. A tag typed into a sentence later does not turn a
 * row tag into an inline one, because the line it sits on has not changed.
 */
export type TagOrigin = "row" | "inline"

export function tagOrigin(doc: string, tag: string): TagOrigin {
  const key = tag.toLowerCase()
  const lines = doc.split("\n")
  if (tagHeaderLines(lines.slice(0, 3)) === 0) return "inline"

  const onHeader = findTags(lines[0]).some((match) => match.tag.toLowerCase() === key)
  return onHeader ? "row" : "inline"
}

interface Placed extends TagMatch {
  line: string
  lineFrom: number
  lineTo: number
  /** Offset just past the newline ending this line, or the end of the doc. */
  next: number
}

function place(doc: string, tag: string): Placed[] {
  const key = tag.toLowerCase()
  const lines = doc.split("\n")

  const placed: Placed[] = []
  let lineFrom = 0

  for (const line of lines) {
    const lineTo = lineFrom + line.length
    for (const match of findTags(line)) {
      if (match.tag.toLowerCase() !== key) continue
      placed.push({
        tag: match.tag,
        from: lineFrom + match.from,
        to: lineFrom + match.to,
        line,
        lineFrom,
        lineTo,
        next: Math.min(lineTo + 1, doc.length)
      })
    }
    lineFrom = lineTo + 1
  }

  return placed
}

/**
 * Removing one written tag, without touching the sentence around it.
 *
 * On a line of nothing but tags the word goes, since what is left is still a
 * line of tags. In prose only the `#` goes: "I love #thoughts about coffee"
 * becomes "I love thoughts about coffee", which is the reader's sentence with
 * one character less. Cutting the word out would edit their writing, and that
 * was the reason this control did not exist for so long.
 */
function removeOne(occurrence: Placed): TagEdit {
  if (!isTagOnlyLine(occurrence.line)) {
    return { from: occurrence.from, to: occurrence.from + 1, insert: "" }
  }

  // Take one adjoining space with it, so the remaining tags stay one space
  // apart rather than drifting.
  const before = occurrence.from > occurrence.lineFrom ? occurrence.from - 1 : occurrence.from
  const after =
    before === occurrence.from && occurrence.to < occurrence.lineTo
      ? occurrence.to + 1
      : occurrence.to

  return { from: before, to: after, insert: "" }
}

/**
 * Every edit that takes a tag out of a note, in document order.
 *
 * A tags-only line left with nothing on it goes too, along with the blank line
 * under it — otherwise removing the last tag from a note leaves it opening on
 * two blank lines.
 */
export function removeTagEdits(doc: string, tag: string): TagEdit[] {
  const occurrences = place(doc, tag)
  if (occurrences.length === 0) return []

  const edits: TagEdit[] = []
  const byLine = new Map<number, Placed[]>()
  for (const occurrence of occurrences) {
    byLine.set(occurrence.lineFrom, [...(byLine.get(occurrence.lineFrom) ?? []), occurrence])
  }

  for (const [lineFrom, group] of byLine) {
    const [first] = group
    const emptied = isTagOnlyLine(first.line) && findTags(first.line).length === group.length

    if (!emptied) {
      for (const occurrence of group) edits.push(removeOne(occurrence))
      continue
    }

    // The line and its newline. A blank line under it goes as well, so the gap
    // the tags line was holding open does not survive it.
    const after = doc.slice(first.next)
    const blankUnder = /^\r?\n/.test(after) ? after.indexOf("\n") + 1 : 0
    edits.push({ from: lineFrom, to: first.next + blankUnder, insert: "" })
  }

  return edits.sort((a, b) => a.from - b.from)
}

/** The same, for one written occurrence rather than every one of them. */
export function removeOccurrenceEdits(doc: string, from: number, to: number): TagEdit[] {
  const tag = doc.slice(from, to).replace(/^#/, "")
  const occurrence = place(doc, tag).find((entry) => entry.from === from && entry.to === to)
  if (occurrence === undefined) return []

  if (isTagOnlyLine(occurrence.line) && findTags(occurrence.line).length === 1) {
    const after = doc.slice(occurrence.next)
    const blankUnder = /^\r?\n/.test(after) ? after.indexOf("\n") + 1 : 0
    return [{ from: occurrence.lineFrom, to: occurrence.next + blankUnder, insert: "" }]
  }

  return [removeOne(occurrence)]
}

/** Applies edits to a document. The renderer uses CodeMirror; this is for tests
 *  and for anything that only wants the resulting text. */
export function applyEdits(doc: string, edits: TagEdit[]): string {
  let out = doc
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to)
  }
  return out
}

/**
 * What typing `#` should do to a selection.
 *
 * Over a tag it takes the tag off; over a plain word it makes one. Returns null
 * where neither applies, which is the signal to let `#` type itself — a caret
 * sitting in prose is someone starting a tag, not toggling one.
 *
 * A caret has to be strictly inside a tag to count. Resting against one is not
 * being in it, and typing `#` there is how a tag gets written in the first
 * place.
 */
export function tagToggleEdits(doc: string, from: number, to: number): TagEdit[] | null {
  const caret = from === to

  const covering = findTags(doc).find((match) =>
    caret ? match.from < from && from < match.to : match.from < to && from < match.to
  )
  if (covering !== undefined) return removeOccurrenceEdits(doc, covering.from, covering.to)

  if (caret) return null

  // Only a bare word. A selection carrying spaces or punctuation is not a tag
  // name, and quietly rewriting it into one would be a worse surprise than
  // typing the character.
  return /^[A-Za-z][\w-]*$/.test(doc.slice(from, to)) ? [{ from, to: from, insert: "#" }] : null
}

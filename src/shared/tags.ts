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

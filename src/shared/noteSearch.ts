export interface Match {
  from: number
  to: number
}

/**
 * Every place a query appears in a note, case-insensitively.
 *
 * Plain text, not a pattern. Someone searching a note for `(` means the
 * bracket, and a writing app that answered a regex error instead would be
 * answering a question nobody asked.
 */
export function findMatches(doc: string, query: string): Match[] {
  const needle = query.toLowerCase()
  if (needle === "") return []

  const hay = doc.toLowerCase()
  const matches: Match[] = []

  // Non-overlapping, stepping past each hit: searching "aa" in "aaaa" gives
  // two matches rather than three, which is what a reader counts.
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
    matches.push({ from: at, to: at + needle.length })
  }
  return matches
}

/**
 * Which match to land on when the query changes, given where the caret is.
 *
 * The one at or after the caret, so a search from halfway down a note carries
 * on from there rather than jumping to the top. Wraps, because the last match
 * being behind you is not a reason to find nothing.
 */
export function matchNearest(matches: readonly Match[], caret: number): number {
  if (matches.length === 0) return -1
  const at = matches.findIndex((match) => match.from >= caret)
  return at === -1 ? 0 : at
}

/** Steps through the matches, wrapping at either end. */
export function stepMatch(current: number, total: number, direction: 1 | -1): number {
  if (total === 0) return -1
  return (current + direction + total) % total
}

/**
 * Matching a note against a query. Pure, so the rules are testable without a
 * vault: main reads the files and hands the text in, the renderer never sees a
 * body at all.
 */

export type SearchField = "title" | "tag" | "body"

export interface SearchMatch {
  /** Where it matched, so the result can say why it is in the list. */
  where: SearchField
  /** A line of context around a body match; null for title and tag hits. */
  snippet: string | null
  /** Higher is a better answer. Only meaningful against the same query. */
  score: number
}

export interface Searchable {
  title: string
  tags: string[]
  body: string
}

/** How much of the body to show either side of a match. */
const CONTEXT = 40

/**
 * What each kind of hit is worth. The numbers are arbitrary in the way any
 * ranking is, but the order between them is not: a title you typed exactly
 * beats a title that merely contains the word, which beats a tag, which beats a
 * mention buried in a paragraph.
 *
 * Whole-word hits outrank substrings throughout — "morning" meaning the word
 * morning is nearly always what was meant, not the middle of "morningside".
 */
const WEIGHT = {
  titleExact: 100,
  titleStarts: 60,
  titleWord: 45,
  titlePart: 30,
  tagExact: 25,
  tagPart: 15,
  bodyWord: 10,
  bodyPart: 4,
  /** Each further mention past the first, so a note about a thing beats one that mentions it. */
  bodyRepeat: 2,
  /** All the terms together, in order — a phrase is a much stronger signal than its words. */
  phraseTitle: 40,
  phraseBody: 8
} as const

/** Repeats stop counting here: past a handful it says length, not relevance. */
const MAX_REPEATS = 5

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function hasWord(haystack: string, term: string): boolean {
  return new RegExp(`\\b${escape(term)}\\b`).test(haystack)
}

function occurrences(haystack: string, term: string): number {
  return haystack.split(term).length - 1
}

/** What one term is worth across a note, summed over the fields it appears in. */
function scoreTerm(term: string, title: string, tags: string[], body: string): number {
  let score = 0

  if (title === term) score += WEIGHT.titleExact
  else if (title.startsWith(term)) score += WEIGHT.titleStarts
  else if (hasWord(title, term)) score += WEIGHT.titleWord
  else if (title.includes(term)) score += WEIGHT.titlePart

  if (tags.some((tag) => tag === term)) score += WEIGHT.tagExact
  else if (tags.some((tag) => tag.includes(term))) score += WEIGHT.tagPart

  const count = occurrences(body, term)
  if (count > 0) {
    score += hasWord(body, term) ? WEIGHT.bodyWord : WEIGHT.bodyPart
    score += Math.min(count - 1, MAX_REPEATS) * WEIGHT.bodyRepeat
  }

  return score
}

/**
 * The words a query is looking for. Splitting on whitespace means "slow
 * morning" finds a note that says "morning, slow" — a single string would not.
 */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term !== "")
}

/**
 * A line of the body around the first match, with the whitespace collapsed so a
 * hit inside a wrapped paragraph still reads as one line. Ellipses only where
 * something was actually cut.
 */
export function snippetAround(body: string, at: number, length: number): string {
  const from = Math.max(0, at - CONTEXT)
  const to = Math.min(body.length, at + length + CONTEXT)

  const text = body.slice(from, to).replace(/\s+/g, " ").trim()
  return `${from > 0 ? "…" : ""}${text}${to < body.length ? "…" : ""}`
}

/**
 * Where a note matches, or null if it does not. Every term has to appear
 * somewhere, but they need not all appear in the same place: a note titled
 * "Slow Morning" tagged #writing matches "slow writing".
 *
 * The reported field is the best one any single term hit, title first — that is
 * what the reader is most likely to have meant.
 */
export function matchNote(note: Searchable, query: string): SearchMatch | null {
  const terms = queryTerms(query)
  if (terms.length === 0) return null

  const title = note.title.toLowerCase()
  const tags = note.tags.map((tag) => tag.toLowerCase())
  const body = note.body.toLowerCase()

  let best: SearchField | null = null
  let score = 0
  let bodyAt = -1
  let bodyLength = 0

  for (const term of terms) {
    const inTitle = title.includes(term)
    const inTag = tags.some((tag) => tag.includes(term))
    const at = body.indexOf(term)

    if (!inTitle && !inTag && at === -1) return null

    if (inTitle) best = best === null || best === "body" ? "title" : best
    else if (inTag && best !== "title") best = "tag"
    else if (best === null) best = "body"

    if (at !== -1 && bodyAt === -1) {
      bodyAt = at
      bodyLength = term.length
    }

    score += scoreTerm(term, title, tags, body)
  }

  if (best === null) return null

  // The terms in order, as one string, is a far stronger signal than the same
  // words scattered through a note.
  if (terms.length > 1) {
    const phrase = terms.join(" ")
    if (title.includes(phrase)) score += WEIGHT.phraseTitle
    if (body.includes(phrase)) score += WEIGHT.phraseBody
  }

  return {
    where: best,
    score,
    snippet: bodyAt === -1 ? null : snippetAround(note.body, bodyAt, bodyLength)
  }
}

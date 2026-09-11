const MAX_SLUG_LENGTH = 80

/** Filename-safe form of a note title. Never empty — falls back to `untitled`. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "")

  return slug === "" ? "untitled" : slug
}

/**
 * Picks the first free name in `candidate`, `candidate-2`, `candidate-3`… so a
 * second note titled the same never clobbers the first.
 */
export function uniqueSlug(candidate: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(candidate)) return candidate

  for (let suffix = 2; ; suffix++) {
    const next = `${candidate}-${suffix}`
    if (!used.has(next)) return next
  }
}

/**
 * The key two titles are ordered by: accents folded onto their base letters,
 * case ignored. The same fold `slugify` does, and for the same reason — `Émile`
 * belongs beside `Emile` rather than after `Zebra`.
 */
export function sortKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/**
 * Orders two titles, deterministically.
 *
 * This replaces `localeCompare`, which is a collation rather than a comparison
 * and which — called with no locale, as it was — asks the operating system.
 * Two readers with different locales already saw their folders in different
 * orders, which is a bug rather than a feature: a vault should look the same
 * wherever it is opened. Matching that collation in the Rust backend would
 * mean carrying ICU's tables, which is a large thing to carry for a tie-break.
 *
 * So: fold, compare, and fall back to the raw strings when the folds match,
 * which is what puts `emile` before `Emile` rather than leaving it to chance.
 */
export function compareTitles(a: string, b: string): number {
  const keyA = sortKey(a)
  const keyB = sortKey(b)
  if (keyA !== keyB) return keyA < keyB ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Titles shown in the sidebar are lowercased by convention; this is display only. */
export function displayName(title: string): string {
  return title.toLowerCase()
}

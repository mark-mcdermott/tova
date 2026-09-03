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

/** Titles shown in the sidebar are lowercased by convention; this is display only. */
export function displayName(title: string): string {
  return title.toLowerCase()
}

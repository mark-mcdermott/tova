export interface Page<T> {
  items: T[]
  /** 1-based, for reading: "7–12 of 30". */
  first: number
  last: number
  total: number
  page: number
  pages: number
}

/**
 * A window onto a list. The page is clamped rather than trusted, so a stale
 * page number — the list shrank while it was on screen — lands on the last
 * page instead of showing nothing.
 */
export function paginate<T>(items: T[], page: number, size: number): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(page, 1), pages)
  const start = (current - 1) * size
  const window = items.slice(start, start + size)

  return {
    items: window,
    first: items.length === 0 ? 0 : start + 1,
    last: start + window.length,
    total: items.length,
    page: current,
    pages
  }
}

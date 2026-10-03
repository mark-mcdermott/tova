const DAILY_NOTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function padTwo(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * `YYYY-MM-DD` from the *local* calendar date, not UTC — something written at
 * 11pm belongs to that evening, whatever the offset from UTC happens to be.
 * `toISOString` would roll it forward a day.
 */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`
}

/** Daily notes are keyed on that same local date. */
export function toDailyNoteName(date: Date): string {
  return toIsoDate(date)
}

/** Accepts `2026-09-03` or `2026-09-03.md`. Returns null for anything else. */
export function parseDailyNoteName(name: string): Date | null {
  const match = DAILY_NOTE_PATTERN.exec(name.replace(/\.md$/, ""))
  if (!match) return null

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))

  // Rejects impossible dates like 2026-02-31, which Date silently rolls over.
  return toDailyNoteName(date) === `${year}-${month}-${day}` ? date : null
}

export function isDailyNoteName(name: string): boolean {
  return parseDailyNoteName(name) !== null
}

/** The auto-generated title of a daily note, e.g. `9/3/26`. */
export function formatDailyTitle(date: Date): string {
  const year = String(date.getFullYear()).slice(-2)
  return `${date.getMonth() + 1}/${date.getDate()}/${year}`
}

/**
 * A daily note counts as untouched when nothing was written into it. The
 * auto-generated title alone does not count as content, whether it lives in
 * front matter or was echoed into the body as a heading.
 */
/**
 * The inverse of `formatDailyTitle`, for a client with no filenames.
 *
 * The desktop names a daily note `2026-10-03.md` and titles it `10/3/26`, and
 * the filename is what makes it today's note. The web has no filenames — a path
 * there is derived from the title — so the only way back to the date is through
 * the title, and this is that way.
 *
 * Which carries one honest limit: retitle a daily note on the web and it stops
 * being that day's. On the desktop the filename would hold it. Nothing else
 * reads a title to find a date, so nothing else inherits the limit.
 */
export function parseDailyTitle(title: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(title.trim())
  if (match === null) return null

  const [, month, day, year] = match.map(Number) as unknown as number[]
  const date = new Date(2000 + year, month - 1, day)

  // A rolled-over date — 13/40/26 — is not a date somebody wrote down.
  const real =
    date.getMonth() === month - 1 && date.getDate() === day && date.getFullYear() === 2000 + year
  return real ? date : null
}

export function isBlankDailyBody(body: string, title: string): boolean {
  const stripped = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== `# ${title}` && line !== title)

  return stripped.length === 0
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })
}

/**
 * Milliseconds until one second past the next local midnight — when the daily
 * note for the following day gets created. The one-second cushion keeps a timer
 * that fires marginally early from landing back on today's date.
 */
export function msUntilNextMidnight(now: Date): number {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0)
  return target.getTime() - now.getTime()
}

/**
 * How long ago a note was last written, in the mockup's phrasing. Coarse on
 * purpose: a writer wants "a while back", not a stopwatch.
 */
export function formatEditedAgo(updatedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000))
  if (seconds < 45) return "Edited just now"

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Edited ${Math.max(minutes, 1)}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Edited ${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `Edited ${days}d ago`

  return `Edited ${formatDisplayDate(new Date(updatedAt))}`
}

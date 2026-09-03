const DAILY_NOTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Daily notes are keyed on the *local* calendar date, not UTC — a note written
 * at 11pm belongs to that evening, whatever the offset from UTC happens to be.
 */
export function toDailyNoteName(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

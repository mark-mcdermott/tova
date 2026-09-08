export type PublishPhase = "preparing" | "pushing" | "building" | "published" | "failed"

/** How far the bar has moved before the build even starts. */
const PUSHED = 15
/** Held short of the end until the deploy actually reports success. */
const CEILING = 98
/** With no history to go on, assume a build of about this long. */
const ASSUMED_BUILD_MS = 45_000

export interface ProgressInput {
  phase: PublishPhase
  /** Since the publish began. */
  elapsedMs: number
  /** Rolling average of this blog's recent builds, or null when there is none. */
  averageMs: number | null
}

/**
 * The bar is optimistic on purpose: a deploy gives almost no signal between
 * "queued" and "done", so the movement comes from how long this blog's builds
 * usually take. It stops short of the end rather than sitting at 100 while the
 * build is still running, and a build running long simply holds there.
 */
export function publishProgress({ phase, elapsedMs, averageMs }: ProgressInput): number {
  if (phase === "published") return 100
  if (phase === "preparing") return 4
  if (phase === "pushing") return PUSHED
  if (phase === "failed") return PUSHED

  const expected = averageMs === null || averageMs <= 0 ? ASSUMED_BUILD_MS : averageMs
  const share = Math.min(elapsedMs / expected, 1)
  return Math.min(PUSHED + Math.round((CEILING - PUSHED) * share), CEILING)
}

/** Past twice the usual, the estimate has clearly stopped meaning anything. */
export function isOverdue(elapsedMs: number, averageMs: number | null): boolean {
  const expected = averageMs === null || averageMs <= 0 ? ASSUMED_BUILD_MS : averageMs
  return elapsedMs > expected * 2
}

/** Keeps the most recent few durations; anything older says little about now. */
export function recordDuration(history: number[], durationMs: number, keep = 5): number[] {
  return [...history, durationMs].slice(-keep)
}

export function averageDuration(history: number[]): number | null {
  if (history.length === 0) return null
  return history.reduce((total, value) => total + value, 0) / history.length
}

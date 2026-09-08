import { describe, it, expect } from "vitest"
import { averageDuration, isOverdue, publishProgress, recordDuration } from "./publishProgress"

describe("publishProgress", () => {
  it("starts small and lands on the push", () => {
    expect(publishProgress({ phase: "preparing", elapsedMs: 0, averageMs: null })).toBe(4)
    expect(publishProgress({ phase: "pushing", elapsedMs: 500, averageMs: null })).toBe(15)
  })

  it("moves through the build on how long this blog usually takes", () => {
    const half = publishProgress({ phase: "building", elapsedMs: 10_000, averageMs: 20_000 })
    expect(half).toBeGreaterThan(50)
    expect(half).toBeLessThan(60)
  })

  it("stops short of the end while the build is still running", () => {
    expect(publishProgress({ phase: "building", elapsedMs: 600_000, averageMs: 20_000 })).toBe(98)
  })

  it("only reaches the end once the deploy says so", () => {
    expect(publishProgress({ phase: "published", elapsedMs: 1, averageMs: null })).toBe(100)
  })

  it("holds where it was when a publish fails", () => {
    expect(publishProgress({ phase: "failed", elapsedMs: 30_000, averageMs: 20_000 })).toBe(15)
  })

  it("falls back to an assumed build with no history", () => {
    const early = publishProgress({ phase: "building", elapsedMs: 1_000, averageMs: null })
    expect(early).toBeGreaterThan(15)
    expect(early).toBeLessThan(25)
  })
})

describe("isOverdue", () => {
  it("is patient up to twice the usual", () => {
    expect(isOverdue(30_000, 20_000)).toBe(false)
    expect(isOverdue(41_000, 20_000)).toBe(true)
  })
})

describe("duration history", () => {
  it("keeps only the recent few", () => {
    let history: number[] = []
    for (const duration of [1, 2, 3, 4, 5, 6]) history = recordDuration(history, duration)
    expect(history).toEqual([2, 3, 4, 5, 6])
  })

  it("has no average until there is something to average", () => {
    expect(averageDuration([])).toBeNull()
    expect(averageDuration([10, 20])).toBe(15)
  })
})

// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import {
  averageDuration,
  isOverdue,
  publishProgress,
  recordDuration,
  type PublishPhase
} from "./publishProgress"

/*
 * The other half of `conformance/publish.json`.
 *
 * Its readme says "both read this" and only the Rust did. The cases at exactly
 * half a step are there because `Math.round` rounds half away from zero and
 * Rust's `round` agrees — a detail nothing on this side was checking, and the
 * kind that goes quietly wrong when the arithmetic is rearranged.
 *
 * `hashContent` is in the fixture and is not here: it has no TypeScript
 * counterpart. The hashing moved from Electron's main process into the Rust,
 * so those four cases are the Rust being held to an answer this side no longer
 * produces at all, rather than a gap left open.
 */
const fixture = JSON.parse(readFileSync("conformance/publish.json", "utf-8")) as {
  progress: { phase: PublishPhase; elapsedMs: number; averageMs: number | null; percent: number }[]
  overdue: { elapsedMs: number; averageMs: number | null; overdue: boolean }[]
  recordDuration: { history: number[]; durationMs: number; kept: number[] }[]
  averageDuration: { history: number[]; average: number | null }[]
}

describe("how far the bar has moved, against every case the Rust answers", () => {
  it("has enough of them to be worth reading", () => {
    expect(fixture.progress.length).toBeGreaterThan(200)
  })

  fixture.progress.forEach(({ phase, elapsedMs, averageMs, percent }) => {
    it(`${phase} at ${elapsedMs}ms against ${averageMs ?? "no history"}`, () => {
      expect(publishProgress({ phase, elapsedMs, averageMs })).toBe(percent)
    })
  })
})

describe("whether a build is overdue, against every case the Rust answers", () => {
  fixture.overdue.forEach(({ elapsedMs, averageMs, overdue }) => {
    it(`${elapsedMs}ms against ${averageMs ?? "no history"}`, () => {
      expect(isOverdue(elapsedMs, averageMs)).toBe(overdue)
    })
  })
})

describe("what history is kept, against every case the Rust answers", () => {
  fixture.recordDuration.forEach(({ history, durationMs, kept }) => {
    it(`${JSON.stringify(history)} plus ${durationMs}`, () => {
      expect(recordDuration(history, durationMs)).toEqual(kept)
    })
  })

  fixture.averageDuration.forEach(({ history, average }) => {
    it(`average of ${JSON.stringify(history)}`, () => {
      expect(averageDuration(history)).toBe(average)
    })
  })
})

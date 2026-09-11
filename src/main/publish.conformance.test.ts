import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import {
  averageDuration,
  isOverdue,
  publishProgress,
  PublishPhase,
  recordDuration
} from "../shared/publishProgress"

/*
 * The other half of the fixture tests in src-tauri/src/publish_state.rs.
 *
 * The bar rounds, and Math.round rounds half away from zero, so the cases at
 * exactly half a step are the ones worth having. An average of zero or a
 * negative one falls back to the assumed build length rather than dividing by
 * it — which is the difference between a bar that moves and one that is NaN.
 */
interface Fixture {
  progress: { phase: PublishPhase; elapsedMs: number; averageMs: number | null; percent: number }[]
  overdue: { elapsedMs: number; averageMs: number | null; overdue: boolean }[]
  recordDuration: { history: number[]; durationMs: number; kept: number[] }[]
  averageDuration: { history: number[]; average: number | null }[]
  hashContent: { content: string; hash: string }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/publish.json", "utf-8"))

describe("the publish conformance fixture", () => {
  it("says where the bar sits", () => {
    for (const one of doc.progress) {
      expect(publishProgress(one), JSON.stringify(one)).toBe(one.percent)
    }
  })

  it("says when a build has taken too long to mean anything", () => {
    for (const one of doc.overdue) {
      expect(isOverdue(one.elapsedMs, one.averageMs), JSON.stringify(one)).toBe(one.overdue)
    }
  })

  it("says which build times are still worth keeping", () => {
    for (const one of doc.recordDuration) {
      expect(recordDuration(one.history, one.durationMs)).toEqual(one.kept)
    }
  })

  it("says what they average to", () => {
    for (const one of doc.averageDuration) {
      expect(averageDuration(one.history)).toBe(one.average)
    }
  })

  it("says how a post is fingerprinted", () => {
    // Half of how a conflict is spotted, so a difference here would read as
    // "everything changed" on the first sync after switching backends.
    for (const one of doc.hashContent) {
      expect(createHash("sha256").update(one.content, "utf-8").digest("hex")).toBe(one.hash)
    }
  })
})

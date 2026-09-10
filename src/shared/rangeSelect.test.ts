import { describe, it, expect } from "vitest"
import { NOTHING_SELECTED, Selection, afterClick, prune } from "./rangeSelect"

const order = ["a", "b", "c", "d", "e"]
const plain = { shift: false, meta: false }
const shift = { shift: true, meta: false }
const meta = { shift: false, meta: true }

describe("clicking rows", () => {
  it("does not select on a plain click, so the row still opens", () => {
    expect(afterClick(NOTHING_SELECTED, order, "c", plain)).toBeNull()
  })

  it("starts a selection on the first Shift-click", () => {
    // Otherwise the gesture does nothing at all the first time, which reads as
    // broken rather than as needing an anchor.
    expect(afterClick(NOTHING_SELECTED, order, "c", shift)).toEqual({ ids: ["c"], anchor: "c" })
  })

  it("takes the range from the anchor", () => {
    const from: Selection = { ids: ["b"], anchor: "b" }
    expect(afterClick(from, order, "d", shift)).toEqual({ ids: ["b", "c", "d"], anchor: "b" })
  })

  it("takes a range that runs upwards just the same", () => {
    const from: Selection = { ids: ["d"], anchor: "d" }
    expect(afterClick(from, order, "b", shift)).toEqual({ ids: ["b", "c", "d"], anchor: "d" })
  })

  it("keeps the anchor, so a second Shift-click re-aims from the same place", () => {
    const from: Selection = { ids: ["b"], anchor: "b" }
    const wide = afterClick(from, order, "e", shift) as Selection
    expect(afterClick(wide, order, "c", shift)).toEqual({ ids: ["b", "c"], anchor: "b" })
  })

  it("toggles one row on a meta click", () => {
    const one = afterClick(NOTHING_SELECTED, order, "b", meta) as Selection
    expect(one).toEqual({ ids: ["b"], anchor: "b" })
    expect(afterClick(one, order, "b", meta)).toEqual({ ids: [], anchor: null })
  })

  it("adds to a range with a meta click without disturbing it", () => {
    const range = afterClick({ ids: ["b"], anchor: "b" }, order, "c", shift) as Selection
    expect(afterClick(range, order, "e", meta)).toEqual({ ids: ["b", "c", "e"], anchor: "e" })
  })

  it("leaves the selection alone when the row is not in the list", () => {
    const from: Selection = { ids: ["b"], anchor: "b" }
    expect(afterClick(from, order, "zz", shift)).toBe(from)
  })
})

describe("keeping a selection honest", () => {
  it("drops rows that have gone", () => {
    expect(prune({ ids: ["a", "b", "c"], anchor: "a" }, ["a", "c"])).toEqual({
      ids: ["a", "c"],
      anchor: "a"
    })
  })

  it("drops an anchor that has gone, so the next range does not reach nowhere", () => {
    expect(prune({ ids: ["b"], anchor: "a" }, ["b", "c"])).toEqual({ ids: ["b"], anchor: null })
  })

  it("returns the same selection when nothing has changed, so nothing re-renders", () => {
    const selection: Selection = { ids: ["a"], anchor: "a" }
    expect(prune(selection, order)).toBe(selection)
  })
})

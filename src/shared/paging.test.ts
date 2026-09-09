import { describe, it, expect } from "vitest"
import { paginate } from "./paging"

const items = Array.from({ length: 23 }, (_, index) => index + 1)

describe("paginate", () => {
  it("gives the first page and says where it is", () => {
    const page = paginate(items, 1, 10)
    expect(page.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(page).toMatchObject({ first: 1, last: 10, total: 23, page: 1, pages: 3 })
  })

  it("gives a short last page rather than padding it", () => {
    const page = paginate(items, 3, 10)
    expect(page.items).toEqual([21, 22, 23])
    expect(page).toMatchObject({ first: 21, last: 23, pages: 3 })
  })

  it("clamps a page past the end onto the last one", () => {
    // The list can shrink while a page number is on screen.
    expect(paginate(items, 99, 10).page).toBe(3)
  })

  it("clamps a page below the first", () => {
    expect(paginate(items, 0, 10).page).toBe(1)
    expect(paginate(items, -5, 10).page).toBe(1)
  })

  it("says one page for an empty list rather than none", () => {
    const page = paginate([], 1, 10)
    expect(page).toMatchObject({ items: [], first: 0, last: 0, total: 0, page: 1, pages: 1 })
  })

  it("counts a list that fits exactly as one page", () => {
    expect(paginate([1, 2, 3], 1, 3).pages).toBe(1)
  })
})

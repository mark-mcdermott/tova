import { describe, it, expect } from "vitest"
import { DEFAULT_DISC, discColor, discInk } from "./avatar"

/** WCAG's ratio, so the numbers below mean what they mean everywhere else. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const value = (at: number) => {
      const c = parseInt(hex.replace("#", "").slice(at, at + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * value(0) + 0.7152 * value(2) + 0.0722 * value(4)
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/*
 * The initials were white, written into the stylesheet. That was fine for one
 * blue and for nothing else — and the disc has been the reader's to choose for
 * a while, so any pale choice took the initials with it. The default is a
 * yellow now, which makes it immediate: white on it is 1.78:1.
 */
describe("the ink on an avatar disc", () => {
  it("can be read on the default", () => {
    expect(contrast(DEFAULT_DISC, discInk(null))).toBeGreaterThan(4.5)
  })

  /*
   * Two inks cannot promise 4.5:1 against every colour — a mid-tone is far from
   * both. The blue this replaced is one: 4.40:1 against its better ink, and no
   * choice of ink improves on it.
   *
   * So the promise is the one that can be kept: whichever of the two reads
   * better on what the reader picked. Nobody is left with white on lemon
   * because the stylesheet said white.
   */
  it("always takes the better of the two on anything the reader picks", () => {
    const picks = ["#ffffff", "#000000", "#d9c25e", "#3196c9", "#ffe4e1", "#2b0a3d", "#7c6ae8"]
    for (const disc of picks) {
      const chosen = contrast(disc, discInk(disc))
      const other = contrast(disc, discInk(disc) === "#ffffff" ? "#2b2733" : "#ffffff")
      expect(chosen, `on ${disc}`).toBeGreaterThanOrEqual(other)
    }
  })

  it("takes the darker ink on a light disc and the lighter on a dark one", () => {
    expect(discInk("#ffffff")).toBe("#2b2733")
    expect(discInk("#000000")).toBe("#ffffff")
  })

  /* A hand-edited preferences file can hold anything at all. */
  it("does not fall over on a colour that is not one", () => {
    for (const bad of ["", "rebeccapurple", "#xyz", "#12345"]) {
      expect(discInk(bad)).toBe("#ffffff")
    }
  })

  it("still lets the reader choose the disc itself", () => {
    expect(discColor("#123456")).toBe("#123456")
    expect(discColor(null)).toBe(DEFAULT_DISC)
  })
})

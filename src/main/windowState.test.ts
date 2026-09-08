import { describe, it, expect, vi } from "vitest"

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  screen: { getAllDisplays: () => [] }
}))

const { isOnScreen, normalizeWindowState } = await import("./windowState")

const laptop = { x: 0, y: 0, width: 1512, height: 944 }
const external = { x: 1512, y: -200, width: 2560, height: 1440 }

describe("normalizeWindowState", () => {
  it("falls back when there is nothing to read", () => {
    expect(normalizeWindowState(null)).toEqual({
      width: 1280,
      height: 800,
      x: null,
      y: null,
      maximized: false
    })
  })

  it("keeps a remembered frame", () => {
    const state = normalizeWindowState({ width: 1000, height: 700, x: 40, y: 60, maximized: true })
    expect(state).toEqual({ width: 1000, height: 700, x: 40, y: 60, maximized: true })
  })

  it("refuses a window smaller than the app's own minimum", () => {
    const state = normalizeWindowState({ width: 100, height: 50 })
    expect(state.width).toBe(720)
    expect(state.height).toBe(480)
  })

  it("treats a position it cannot read as no position", () => {
    expect(normalizeWindowState({ x: "left", y: null }).x).toBeNull()
  })
})

describe("isOnScreen", () => {
  it("accepts a window on the display it was left on", () => {
    expect(
      isOnScreen(normalizeWindowState({ width: 1000, height: 700, x: 40, y: 60 }), [laptop])
    ).toBe(true)
  })

  it("rejects a window on a monitor that is no longer attached", () => {
    // Remembered on the external display; only the laptop is present now.
    const state = normalizeWindowState({ width: 1000, height: 700, x: 2000, y: 100 })
    expect(isOnScreen(state, [laptop])).toBe(false)
    expect(isOnScreen(state, [laptop, external])).toBe(true)
  })

  it("accepts a window that only partly overlaps, since it can still be grabbed", () => {
    const state = normalizeWindowState({ width: 1000, height: 700, x: 1400, y: 0 })
    expect(isOnScreen(state, [laptop])).toBe(true)
  })

  it("rejects one with no remembered position at all", () => {
    expect(isOnScreen(normalizeWindowState({}), [laptop])).toBe(false)
  })
})

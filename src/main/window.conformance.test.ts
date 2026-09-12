import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { isOnScreen, normalizeWindowState, WindowState } from "./windowState"

/*
 * The other half of the fixture tests in src-tauri/src/window_state.rs.
 *
 * Both backends read and write the same window.json, so they have to agree
 * about what a half-written one means — and the fallback is per field rather
 * than all at once, so a file with a good size and a nonsense position keeps
 * the size.
 *
 * Everything here is logical pixels. Tauri reports physical ones and divides
 * by the scale factor before writing, or a window left at 1345 wide on a
 * Retina display comes back filling two of them.
 */
interface Area {
  x: number
  y: number
  width: number
  height: number
}

interface Fixture {
  normalize: { stored: unknown; state: WindowState }[]
  onScreen: { areas: Area[]; state: WindowState; onScreen: boolean }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/window.json", "utf-8"))

describe("the window conformance fixture", () => {
  it("says what a stored frame means", () => {
    for (const one of doc.normalize) {
      expect(normalizeWindowState(one.stored), JSON.stringify(one.stored)).toEqual(one.state)
    }
  })

  it("says whether a remembered position can still be reached", () => {
    for (const one of doc.onScreen) {
      expect(isOnScreen(one.state, one.areas), JSON.stringify(one)).toBe(one.onScreen)
    }
  })
})

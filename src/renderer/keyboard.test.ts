import { describe, it, expect, afterEach, vi } from "vitest"
import { insetFrom, watchKeyboard } from "./keyboard"

function stubViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<() => void>>()
  const view = {
    height,
    offsetTop,
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener)
    }
  }

  Object.defineProperty(window, "visualViewport", { value: view, configurable: true })
  Object.defineProperty(window, "innerHeight", { value: 812, configurable: true })

  return {
    view,
    count: () => (listeners.get("resize")?.size ?? 0) + (listeners.get("scroll")?.size ?? 0),
    open: (to: number, offset = 0) => {
      view.height = to
      view.offsetTop = offset
      listeners.get("resize")?.forEach((listener) => listener())
    }
  }
}

const inset = () => document.documentElement.style.getPropertyValue("--keyboard-inset")

afterEach(() => {
  document.documentElement.style.removeProperty("--keyboard-inset")
  vi.restoreAllMocks()
})

describe("the strip the keyboard is standing in front of", () => {
  it("is nothing when there is no keyboard", () => {
    expect(insetFrom({ height: 812, offsetTop: 0 }, 812)).toBe(0)
  })

  it("is the height the keys took", () => {
    expect(insetFrom({ height: 476, offsetTop: 0 }, 812)).toBe(336)
  })

  /*
   * The page scrolls itself to keep a focused field above the keys, which
   * moves the visible window down the document. Measuring height alone would
   * call that a smaller keyboard and leave the cursor behind it.
   */
  it("counts the page being scrolled to follow a field", () => {
    expect(insetFrom({ height: 476, offsetTop: 100 }, 812)).toBe(236)
  })

  /*
   * Rubber-banding past the top makes the visible window look taller than the
   * page it is in. There is no keyboard there, and no negative padding.
   */
  it("is never negative", () => {
    expect(insetFrom({ height: 900, offsetTop: 0 }, 812)).toBe(0)
    expect(insetFrom({ height: 812, offsetTop: -60 }, 812)).toBe(0)
  })

  it("ignores a pixel of disagreement between the two viewports", () => {
    expect(insetFrom({ height: 811.5, offsetTop: 0 }, 812)).toBe(0)
  })
})

describe("following the keyboard", () => {
  it("publishes the inset where the stylesheet can read it", () => {
    const keyboard = stubViewport(812)
    const stop = watchKeyboard()
    expect(inset()).toBe("0px")

    keyboard.open(476)
    expect(inset()).toBe("336px")

    stop()
  })

  it("takes it back off when it is let go, and stops listening", () => {
    const keyboard = stubViewport(812)
    const stop = watchKeyboard()
    expect(keyboard.count()).toBe(2)

    stop()

    expect(keyboard.count()).toBe(0)
    expect(inset()).toBe("")
  })

  /*
   * Every other browser Tova runs in has `visualViewport`, but a webview that
   * does not should get a working editor rather than a thrown error at mount.
   */
  it("does nothing where there is no visual viewport to ask", () => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true })

    expect(() => watchKeyboard()()).not.toThrow()
    expect(inset()).toBe("")
  })
})

import { describe, it, expect, vi, afterEach } from "vitest"
import { resolveTheme, systemTheme, watchSystemTheme } from "./theme"

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    matches,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener)
  }
  window.matchMedia = vi.fn().mockReturnValue(query) as unknown as typeof window.matchMedia
  return {
    listeners,
    fire: (dark: boolean) =>
      listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent))
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resolveTheme", () => {
  it("takes an explicit choice at its word", () => {
    stubMatchMedia(true)
    expect(resolveTheme("light")).toBe("light")
    expect(resolveTheme("dark")).toBe("dark")
  })

  it("asks the OS what system means", () => {
    stubMatchMedia(true)
    expect(resolveTheme("system")).toBe("dark")

    stubMatchMedia(false)
    expect(resolveTheme("system")).toBe("light")
  })
})

describe("systemTheme", () => {
  it("reads the media query rather than guessing", () => {
    stubMatchMedia(false)
    expect(systemTheme()).toBe("light")
  })
})

describe("watchSystemTheme", () => {
  it("reports a switch without a restart", () => {
    const media = stubMatchMedia(false)
    const onChange = vi.fn()
    watchSystemTheme(onChange)

    media.fire(true)
    expect(onChange).toHaveBeenCalledWith("dark")
  })

  it("stops listening once unsubscribed", () => {
    const media = stubMatchMedia(false)
    const onChange = vi.fn()
    watchSystemTheme(onChange)()

    media.fire(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(media.listeners.size).toBe(0)
  })
})

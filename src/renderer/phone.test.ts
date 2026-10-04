import { describe, it, expect, vi, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { PHONE_MAX, isPhone, watchPhone } from "./phone"

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    matches,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener)
  }
  const matchMedia = vi.fn().mockReturnValue(query)
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia

  return {
    matchMedia,
    listeners,
    fire: (phone: boolean) =>
      listeners.forEach((listener) => listener({ matches: phone } as MediaQueryListEvent))
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("which layout this viewport gets", () => {
  it("asks for a width at or under the breakpoint, not over it", () => {
    const { matchMedia } = stubMatchMedia(false)

    isPhone()

    // `min-width` here would answer every question backwards while still
    // being a valid query that matches something.
    expect(matchMedia).toHaveBeenCalledWith(`(max-width: ${PHONE_MAX}px)`)
  })

  it("is the phone layout when the query matches, and not when it does not", () => {
    stubMatchMedia(true)
    expect(isPhone()).toBe(true)

    stubMatchMedia(false)
    expect(isPhone()).toBe(false)
  })
})

describe("following the viewport across the breakpoint", () => {
  it("reports a rotation without being asked again", () => {
    const { fire } = stubMatchMedia(false)
    const seen: boolean[] = []

    watchPhone((phone) => seen.push(phone))
    fire(true)
    fire(false)

    expect(seen).toEqual([true, false])
  })

  it("stops listening when it is let go", () => {
    const { fire, listeners } = stubMatchMedia(false)
    const seen: boolean[] = []

    const stop = watchPhone((phone) => seen.push(phone))
    stop()
    fire(true)

    expect(listeners.size).toBe(0)
    expect(seen).toEqual([])
  })
})

/*
 * The breakpoint exists twice — once here as a number and once in the
 * stylesheet as a query — and nothing in either language can see the other. A
 * stylesheet that switched at 768 while the app believed 767 would leave a
 * sidebar laid out in the flow and told to behave as though it were over the
 * writing, which is a sidebar with nothing underneath it and no way back.
 */
describe("the breakpoint, in both languages", () => {
  const css = readFileSync("src/renderer/styles/phone.css", "utf-8")

  it("is the only width the phone stylesheet switches on", () => {
    const widths = [...css.matchAll(/\(\s*(?:max|min)-width:\s*([^)]+)\)/g)].map((m) => m[1].trim())

    expect(widths.length).toBeGreaterThan(0)
    expect([...new Set(widths)]).toEqual([`${PHONE_MAX}px`])
  })
})

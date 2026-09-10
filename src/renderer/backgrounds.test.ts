import { describe, it, expect, afterEach } from "vitest"
import {
  SHUFFLE,
  pickBackground,
  applyBackground,
  resolveBackground,
  showsShuffle
} from "./backgrounds"

const urls = ["a.jpg", "b.jpg", "c.jpg"]

afterEach(() => {
  document.documentElement.style.removeProperty("--bg-photo")
})

describe("pickBackground", () => {
  it("returns null when nothing is bundled", () => {
    expect(pickBackground([], () => 0)).toBeNull()
  })

  it("picks the first for a low draw", () => {
    expect(pickBackground(urls, () => 0)).toBe("a.jpg")
  })

  it("picks the middle for a mid draw", () => {
    expect(pickBackground(urls, () => 0.5)).toBe("b.jpg")
  })

  it("stays in range for a draw approaching one", () => {
    expect(pickBackground(urls, () => 0.999999)).toBe("c.jpg")
  })

  it("does not overrun if random returns exactly one", () => {
    expect(pickBackground(urls, () => 1)).toBe("c.jpg")
  })

  it("can return any of them across many draws", () => {
    const seen = new Set(Array.from({ length: 300 }, () => pickBackground(urls) as string))
    expect(seen.size).toBe(urls.length)
  })

  it("handles a single bundled image", () => {
    expect(pickBackground(["only.jpg"], () => 0.7)).toBe("only.jpg")
  })
})

describe("applyBackground", () => {
  it("sets the custom property the stylesheet reads", () => {
    applyBackground("photo.jpg")
    expect(document.documentElement.style.getPropertyValue("--bg-photo")).toBe('url("photo.jpg")')
  })

  it("leaves the gradient fallback in place when there is no photo", () => {
    applyBackground(null)
    expect(document.documentElement.style.getPropertyValue("--bg-photo")).toBe("")
  })
})

describe("resolveBackground", () => {
  it("paints nothing for none, in either theme", () => {
    expect(resolveBackground(null, "light")).toBeNull()
    expect(resolveBackground(null, "dark")).toBeNull()
  })

  it("shuffles only through the photographs bundled for that mode", () => {
    // A bright sky cannot carry white text and a night sky cannot carry black,
    // so a shuffle must never reach across.
    for (let i = 0; i < 40; i++) {
      expect(resolveBackground(SHUFFLE, "dark")).toContain("milky-way")
      expect(resolveBackground(SHUFFLE, "light")).toContain("lake-sunset")
    }
  })

  it("shuffles through the reader's own pictures as well, in both modes", () => {
    const seen = new Set<string | null>()
    for (let i = 0; i < 60; i++) seen.add(resolveBackground(SHUFFLE, "dark", ["mine.jpg"]))

    expect([...seen].some((url) => url?.includes("mine.jpg"))).toBe(true)
  })

  it("uses a chosen picture", () => {
    expect(resolveBackground("mine.jpg", "dark", ["mine.jpg"])).toContain("mine.jpg")
  })

  it("finds a bundled picture whichever mode's folder it sits in", () => {
    // The stored name is a bare filename, so it has to resolve either way.
    expect(resolveBackground("milky-way.jpg", "dark")).toContain("milky-way")
    expect(resolveBackground("lake-sunset.jpg", "light")).toContain("lake-sunset")
  })

  it("falls back to nothing when the chosen file is gone", () => {
    expect(resolveBackground("deleted.jpg", "light")).toBeNull()
  })
})

describe("showsShuffle", () => {
  it("is hidden with one picture, which there is nothing to shuffle between", () => {
    expect(showsShuffle(1, null)).toBe(false)
  })

  it("appears once there are two", () => {
    expect(showsShuffle(2, null)).toBe(true)
  })

  it("stays when it is already the choice, or nothing would look chosen", () => {
    // A reader who shuffled and then removed pictures until one was left.
    expect(showsShuffle(1, SHUFFLE)).toBe(true)
  })

  it("is hidden with one picture that is chosen by name", () => {
    expect(showsShuffle(1, "lake-sunset.jpg")).toBe(false)
  })
})

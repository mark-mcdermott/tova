import { describe, it, expect, afterEach } from "vitest"
import { pickBackground, applyBackground, resolveBackground } from "./backgrounds"

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
  it("shuffles for light when nothing is chosen", () => {
    expect(resolveBackground(null, "light")).not.toBeNull()
  })

  it("shows no photograph for dark when nothing is chosen", () => {
    // Every bundled image is a bright one; the gradient underneath is built
    // for this and can carry white text.
    expect(resolveBackground(null, "dark")).toBeNull()
  })

  it("falls back the same way when the chosen file is gone", () => {
    expect(resolveBackground("deleted.jpg", "dark")).toBeNull()
    expect(resolveBackground("deleted.jpg", "light")).not.toBeNull()
  })
})

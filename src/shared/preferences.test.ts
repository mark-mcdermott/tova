import { describe, it, expect } from "vitest"
import { DEFAULT_PREFERENCES, normalizePreferences } from "./preferences"

describe("normalizePreferences", () => {
  it("falls back to the defaults for anything unreadable", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences("nonsense")).toEqual(DEFAULT_PREFERENCES)
  })

  it("keeps values it recognises", () => {
    const kept = normalizePreferences({ displayName: "Mark", fontSize: 18, spellcheck: false })

    expect(kept.displayName).toBe("Mark")
    expect(kept.fontSize).toBe(18)
    expect(kept.spellcheck).toBe(false)
  })

  it("clamps a size the UI could never have produced", () => {
    expect(normalizePreferences({ fontSize: 400 }).fontSize).toBe(24)
    expect(normalizePreferences({ fontSize: 1 }).fontSize).toBe(12)
  })

  it("clamps a backup schedule that would hammer the disk", () => {
    expect(normalizePreferences({ backupIntervalMinutes: 0 }).backupIntervalMinutes).toBe(5)
    expect(normalizePreferences({ backupLimit: 100000 }).backupLimit).toBe(200)
  })

  it("refuses a size that is not a number at all", () => {
    expect(normalizePreferences({ fontSize: "huge" }).fontSize).toBe(12)
  })

  it("rounds rather than carrying a fractional size", () => {
    expect(normalizePreferences({ tabSize: 3.7 }).tabSize).toBe(4)
  })

  it("caps a display name rather than storing an essay", () => {
    expect(normalizePreferences({ displayName: "x".repeat(200) }).displayName).toHaveLength(60)
  })

  it("treats a missing background as shuffle", () => {
    expect(normalizePreferences({ background: 42 }).background).toBeNull()
  })
})

describe("title font", () => {
  it("defaults to Alagambe", () => {
    expect(normalizePreferences({}).titleFont).toBe("alagambe")
  })

  it("keeps the other face when it is chosen", () => {
    expect(normalizePreferences({ titleFont: "fascinate" }).titleFont).toBe("fascinate")
  })

  it("falls back rather than trusting a face that is not bundled", () => {
    expect(normalizePreferences({ titleFont: "comic-sans" }).titleFont).toBe("alagambe")
  })
})

describe("proseWidth", () => {
  it("defaults to the mockup's narrow column", () => {
    expect(normalizePreferences({}).proseWidth).toBe("narrow")
  })

  it("keeps the full-width choice", () => {
    expect(normalizePreferences({ proseWidth: "full" }).proseWidth).toBe("full")
  })

  it("falls back on anything else", () => {
    expect(normalizePreferences({ proseWidth: "poetry" }).proseWidth).toBe("narrow")
  })
})


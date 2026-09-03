import { describe, it, expect } from "vitest"
import {
  toDailyNoteName,
  parseDailyNoteName,
  isDailyNoteName,
  formatDisplayDate,
  msUntilNextMidnight
} from "./date"

describe("toDailyNoteName", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(toDailyNoteName(new Date(2026, 8, 3))).toBe("2026-09-03")
  })

  it("zero-pads single digit months and days", () => {
    expect(toDailyNoteName(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("uses the local date, not UTC", () => {
    // 11pm local on the 3rd stays the 3rd even where UTC has rolled over.
    expect(toDailyNoteName(new Date(2026, 8, 3, 23, 0, 0))).toBe("2026-09-03")
  })
})

describe("parseDailyNoteName", () => {
  it("parses a bare date", () => {
    expect(toDailyNoteName(parseDailyNoteName("2026-09-03")!)).toBe("2026-09-03")
  })

  it("parses a date with the .md extension", () => {
    expect(toDailyNoteName(parseDailyNoteName("2026-09-03.md")!)).toBe("2026-09-03")
  })

  it("rejects a non-date filename", () => {
    expect(parseDailyNoteName("meeting-notes.md")).toBeNull()
  })

  it("rejects an impossible calendar date", () => {
    expect(parseDailyNoteName("2026-02-31")).toBeNull()
  })

  it("rejects an out-of-range month", () => {
    expect(parseDailyNoteName("2026-13-01")).toBeNull()
  })

  it("rejects an unpadded date", () => {
    expect(parseDailyNoteName("2026-9-3")).toBeNull()
  })

  it("accepts a leap day in a leap year", () => {
    expect(parseDailyNoteName("2028-02-29")).not.toBeNull()
  })

  it("rejects a leap day in a common year", () => {
    expect(parseDailyNoteName("2026-02-29")).toBeNull()
  })
})

describe("isDailyNoteName", () => {
  it("is true for a valid daily note", () => {
    expect(isDailyNoteName("2026-09-03.md")).toBe(true)
  })

  it("is false for a regular note", () => {
    expect(isDailyNoteName("groceries.md")).toBe(false)
  })
})

describe("formatDisplayDate", () => {
  it("renders a human readable date", () => {
    expect(formatDisplayDate(new Date(2026, 8, 3))).toContain("2026")
  })
})

describe("msUntilNextMidnight", () => {
  it("counts to one second past the next midnight", () => {
    const now = new Date(2026, 8, 3, 23, 0, 0)
    expect(msUntilNextMidnight(now)).toBe(60 * 60 * 1000 + 1000)
  })

  it("is always positive", () => {
    const justBefore = new Date(2026, 8, 3, 23, 59, 59, 999)
    expect(msUntilNextMidnight(justBefore)).toBeGreaterThan(0)
  })

  it("spans a full day plus a second from just after midnight", () => {
    const now = new Date(2026, 8, 3, 0, 0, 1)
    expect(msUntilNextMidnight(now)).toBe(24 * 60 * 60 * 1000)
  })
})

import { describe, it, expect } from "vitest"
import {
  backupFolderName,
  parseBackupFolderName,
  selectExpiredBackups,
  selectExpiredVersions,
  sortBackups,
  versionFileName,
  versionKey,
  withVersion
} from "./backup"

describe("backupFolderName", () => {
  it("formats a dated, sortable folder name", () => {
    expect(backupFolderName(new Date(2026, 8, 3, 10, 30, 5))).toBe("2026-09-03_10-30-05")
  })

  it("zero-pads every field", () => {
    expect(backupFolderName(new Date(2026, 0, 5, 4, 7, 9))).toBe("2026-01-05_04-07-09")
  })

  it("sorts lexically in chronological order", () => {
    const early = backupFolderName(new Date(2026, 8, 3, 9, 0, 0))
    const late = backupFolderName(new Date(2026, 8, 3, 10, 0, 0))
    expect(early < late).toBe(true)
  })
})

describe("parseBackupFolderName", () => {
  it("round-trips a generated name", () => {
    const date = new Date(2026, 8, 3, 10, 30, 5)
    expect(parseBackupFolderName(backupFolderName(date))?.getTime()).toBe(date.getTime())
  })

  it("rejects an unrelated folder", () => {
    expect(parseBackupFolderName("notes")).toBeNull()
  })

  it("rejects an impossible timestamp", () => {
    expect(parseBackupFolderName("2026-02-31_10-00-00")).toBeNull()
  })

  it("rejects an out-of-range hour", () => {
    expect(parseBackupFolderName("2026-09-03_25-00-00")).toBeNull()
  })
})

describe("sortBackups", () => {
  it("returns newest first", () => {
    const sorted = sortBackups([
      "2026-09-01_10-00-00",
      "2026-09-03_10-00-00",
      "2026-09-02_10-00-00"
    ])
    expect(sorted[0]).toBe("2026-09-03_10-00-00")
  })

  it("drops entries that are not backups", () => {
    expect(sortBackups(["notes", ".DS_Store", "2026-09-01_10-00-00"])).toEqual([
      "2026-09-01_10-00-00"
    ])
  })
})

describe("selectExpiredBackups", () => {
  const names = Array.from({ length: 35 }, (_, index) =>
    backupFolderName(new Date(2026, 8, 3, 0, 0, index))
  )

  it("keeps the configured number of backups", () => {
    expect(selectExpiredBackups(names, 30)).toHaveLength(5)
  })

  it("expires the oldest, never the newest", () => {
    const expired = selectExpiredBackups(names, 30)
    expect(expired).toContain(names[0])
    expect(expired).not.toContain(names[names.length - 1])
  })

  it("expires nothing below the limit", () => {
    expect(selectExpiredBackups(names.slice(0, 10), 30)).toEqual([])
  })

  it("expires everything when keeping none", () => {
    expect(selectExpiredBackups(names.slice(0, 3), 0)).toHaveLength(3)
  })

  it("rejects a negative limit", () => {
    expect(() => selectExpiredBackups(names, -1)).toThrow()
  })
})

describe("versionKey", () => {
  it("flattens a nested note id", () => {
    expect(versionKey("notes/ideas/river.md")).toBe("notes__ideas__river.md")
  })

  it("leaves a flat id recognisable", () => {
    expect(versionKey("daily/2026-09-03.md")).toBe("daily__2026-09-03.md")
  })

  it("produces distinct keys for distinct notes", () => {
    expect(versionKey("notes/a.md")).not.toBe(versionKey("notes/b.md"))
  })
})

describe("selectExpiredVersions", () => {
  const versions = Array.from({ length: 14 }, (_, index) =>
    versionFileName(new Date(2026, 8, 3, 0, 0, index))
  )

  it("keeps the ten most recent by default", () => {
    expect(selectExpiredVersions(versions)).toHaveLength(4)
  })

  it("expires the oldest first", () => {
    expect(selectExpiredVersions(versions)).toContain(versions[0])
  })

  it("keeps the newest version", () => {
    expect(selectExpiredVersions(versions)).not.toContain(versions[versions.length - 1])
  })

  it("ignores non-markdown entries", () => {
    expect(selectExpiredVersions([".DS_Store", ...versions.slice(0, 3)])).toEqual([])
  })
})

describe("the versions a note keeps behind it", () => {
  const at = (minute: number) => new Date(2026, 9, 3, 12, minute, 0)

  it("keeps the text that was replaced, named by when", () => {
    const kept = withVersion({}, "before", at(1))

    expect(Object.values(kept)).toEqual(["before"])
    expect(Object.keys(kept)[0]).toMatch(/^2026-10-03_12-01-00\.md$/)
  })

  /*
   * Ten, the same as the desktop. A note's history is a safety net rather than
   * an archive, and an unbounded one in a browser is a quota nobody asked for.
   */
  it("keeps only the newest ten", () => {
    let kept = {}
    // Five minutes apart, which is the closest two are ever taken.
    for (let step = 1; step <= 15; step += 1) kept = withVersion(kept, `v${step}`, at(step * 5))

    expect(Object.keys(kept)).toHaveLength(10)
    expect(Object.values(kept)).toContain("v15")
    expect(Object.values(kept)).not.toContain("v1")
  })

  /*
   * Autosave fires constantly. A version is named by the second it was taken,
   * so two inside one second would be one name — and ten versions would
   * quietly mean ten distinct seconds rather than ten points in a note's past.
   */
  it("keeps one version for a burst of typing, not ten", () => {
    let kept = withVersion({}, "before the burst", at(0))
    for (let minute = 1; minute <= 4; minute += 1)
      kept = withVersion(kept, `v${minute}`, at(minute))

    expect(Object.values(kept)).toEqual(["before the burst"])
  })

  it("takes another once the gap has passed", () => {
    let kept = withVersion({}, "first", at(0))
    kept = withVersion(kept, "later", at(6))

    expect(Object.values(kept).sort()).toEqual(["first", "later"])
  })

  /*
   * Nothing to recover from an empty note, and keeping one would push a real
   * version out of a list that only holds ten.
   */
  it("does not keep an empty one", () => {
    expect(withVersion({ "a.md": "something" }, "", at(1))).toEqual({ "a.md": "something" })
  })

  it("leaves the ones already held alone", () => {
    const kept = withVersion({ "2026-10-03_12-00-00.md": "older" }, "newer", at(6))

    expect(Object.values(kept).sort()).toEqual(["newer", "older"])
  })
})

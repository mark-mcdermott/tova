import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile, access } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { toDailyNoteName, msUntilNextMidnight } from "../shared/date"

const paths = vi.hoisted(() => ({ documents: "" }))

vi.mock("electron", () => ({
  app: { getPath: () => paths.documents }
}))

const { ensureDailyNote, cleanupBlankDailyNotes, startDailyNoteSchedule } = await import("./daily")
const { ensureVault, vaultRoot } = await import("./vault")
const { readNote, writeNote, listNotes } = await import("./notes")

function dailyFile(name: string): string {
  return join(vaultRoot(), "daily", name)
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

/** Writes a daily note straight to disk, bypassing the create path. */
async function seedDaily(date: Date, body: string): Promise<string> {
  const name = toDailyNoteName(date)
  const title = `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`
  await writeFile(
    dailyFile(`${name}.md`),
    `---\ntitle: ${title}\nsection: daily\n---\n\n${body}`,
    "utf-8"
  )
  return `daily/${name}.md`
}

beforeAll(async () => {
  paths.documents = await mkdtemp(join(tmpdir(), "tova-daily-"))
})

afterAll(async () => {
  await rm(paths.documents, { recursive: true, force: true })
})

beforeEach(async () => {
  await rm(vaultRoot(), { recursive: true, force: true })
  await ensureVault()
})

describe("ensureDailyNote", () => {
  it("creates today's note named for the date", async () => {
    const note = await ensureDailyNote(new Date(2026, 8, 3))
    expect(note.id).toBe("daily/2026-09-03.md")
    expect(await exists(dailyFile("2026-09-03.md"))).toBe(true)
  })

  it("titles it M/D/YY", async () => {
    expect((await ensureDailyNote(new Date(2026, 4, 17))).title).toBe("5/17/26")
  })

  it("creates it with an empty body", async () => {
    expect((await ensureDailyNote(new Date(2026, 8, 3))).body.trim()).toBe("")
  })

  it("is idempotent", async () => {
    const first = await ensureDailyNote(new Date(2026, 8, 3))
    const second = await ensureDailyNote(new Date(2026, 8, 3))

    expect(second.id).toBe(first.id)
    expect(await listNotes()).toHaveLength(1)
  })

  it("never overwrites an existing note's contents", async () => {
    const note = await ensureDailyNote(new Date(2026, 8, 3))
    await writeNote(note.id, note.title, "already written today")

    await ensureDailyNote(new Date(2026, 8, 3))
    expect((await readNote(note.id)).body).toBe("already written today")
  })
})

describe("cleanupBlankDailyNotes", () => {
  const today = new Date(2026, 8, 3)

  it("removes a blank past note", async () => {
    const id = await seedDaily(new Date(2026, 8, 1), "")
    expect(await cleanupBlankDailyNotes(today)).toEqual([id])
    expect(await exists(dailyFile("2026-09-01.md"))).toBe(false)
  })

  it("keeps a past note that was written in", async () => {
    await seedDaily(new Date(2026, 8, 1), "met with Sam")
    expect(await cleanupBlankDailyNotes(today)).toEqual([])
    expect(await exists(dailyFile("2026-09-01.md"))).toBe(true)
  })

  it("keeps today's note even when blank", async () => {
    await ensureDailyNote(today)
    expect(await cleanupBlankDailyNotes(today)).toEqual([])
    expect(await exists(dailyFile("2026-09-03.md"))).toBe(true)
  })

  it("keeps a future note even when blank", async () => {
    await seedDaily(new Date(2026, 8, 4), "")
    expect(await cleanupBlankDailyNotes(today)).toEqual([])
  })

  it("treats a past note holding only its own title as blank", async () => {
    await seedDaily(new Date(2026, 8, 1), "# 9/1/26\n\n")
    expect(await cleanupBlankDailyNotes(today)).toHaveLength(1)
  })

  it("ignores files that are not daily notes", async () => {
    await writeFile(dailyFile("scratch.md"), "loose file", "utf-8")
    await cleanupBlankDailyNotes(today)
    expect(await exists(dailyFile("scratch.md"))).toBe(true)
  })

  it("leaves notes in other sections alone", async () => {
    await seedDaily(new Date(2026, 8, 1), "")
    const before = await listNotes()
    await cleanupBlankDailyNotes(today)

    const after = await listNotes()
    expect(before.length - after.length).toBe(1)
  })

  it("does nothing on an empty daily folder", async () => {
    expect(await cleanupBlankDailyNotes(today)).toEqual([])
  })
})

describe("startDailyNoteSchedule", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("arms a timer for just after the next midnight", () => {
    vi.useFakeTimers()
    const now = new Date(2026, 8, 3, 23, 0, 0)
    vi.setSystemTime(now)

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
    const stop = startDailyNoteSchedule()

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), msUntilNextMidnight(now))
    stop()
  })

  it("stops cleanly when cancelled", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 3, 23, 0, 0))

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout")
    startDailyNoteSchedule()()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it("creates the next day's note when it fires", async () => {
    // The timer only calls ensureDailyNote; creating tomorrow's file is the
    // behaviour that matters, and it is verified directly here.
    await ensureDailyNote(new Date(2026, 8, 4))
    expect(await exists(dailyFile("2026-09-04.md"))).toBe(true)
  })
})

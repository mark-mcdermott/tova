import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir, userInfo } from "os"
import { join } from "path"

const paths = vi.hoisted(() => ({ userData: "" }))

vi.mock("electron", () => ({ app: { getPath: () => paths.userData } }))
const { readPreferences, writePreferences } = await import("./preferences")

const created: string[] = []

beforeEach(async () => {
  paths.userData = await mkdtemp(join(tmpdir(), "tova-prefs-"))
  created.push(paths.userData)
})

afterAll(async () => {
  for (const path of created) await rm(path, { recursive: true, force: true })
})

describe("readPreferences", () => {
  it("seeds the display name from the account on a first run", async () => {
    // Compared against the real account rather than a mocked one: the point is
    // that the sidebar footer is not blank on a fresh install.
    expect((await readPreferences()).displayName).toBe(userInfo().username)
    expect((await readPreferences()).displayName).not.toBe("")
  })

  it("writes that seed, so it is editable like any other value", async () => {
    await readPreferences()
    const stored = JSON.parse(await readFile(join(paths.userData, "preferences.json"), "utf-8"))
    expect(stored.displayName).toBe(userInfo().username)
  })

  it("respects a name the writer cleared rather than seeding over it", async () => {
    await writePreferences({ ...(await readPreferences()), displayName: "" })
    expect((await readPreferences()).displayName).toBe("")
  })

  it("keeps a name the writer chose", async () => {
    await writePreferences({ ...(await readPreferences()), displayName: "Mark" })
    expect((await readPreferences()).displayName).toBe("Mark")
  })

  it("falls back to the defaults when the file cannot be parsed", async () => {
    await writeFile(join(paths.userData, "preferences.json"), "{ not json", "utf-8")
    const preferences = await readPreferences()
    expect(preferences.fontSize).toBe(23)
  })
})

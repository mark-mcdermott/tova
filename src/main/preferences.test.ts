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
  it("starts a first run on the account's own name", async () => {
    // Not copied into the field: the name is read where it lives, so renaming
    // the account renames it here. The point is that the footer is not blank.
    expect((await readPreferences()).displayNameSource).toBe("system")
    expect(userInfo().username).not.toBe("")
  })

  it("writes that choice, so it is one like any other", async () => {
    await readPreferences()
    const stored = JSON.parse(await readFile(join(paths.userData, "preferences.json"), "utf-8"))
    expect(stored.displayNameSource).toBe("system")
    // The field stays empty: nothing was typed.
    expect(stored.displayName).toBe("")
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
    expect(preferences.fontSize).toBe(18)
  })
})

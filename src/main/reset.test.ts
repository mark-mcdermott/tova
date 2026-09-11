import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { homedir, tmpdir } from "os"
import { join } from "path"

const paths = vi.hoisted(() => ({ userData: "", documents: "" }))

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "documents" ? paths.documents : paths.userData),
    relaunch: vi.fn(),
    exit: vi.fn()
  }
}))

const { nukeTargets } = await import("./reset")
const { writePreferences } = await import("./preferences")
const { DEFAULT_PREFERENCES } = await import("../shared/preferences")

const created: string[] = []

beforeEach(async () => {
  paths.userData = await mkdtemp(join(tmpdir(), "tova-reset-"))
  paths.documents = await mkdtemp(join(tmpdir(), "tova-docs-"))
  created.push(paths.userData, paths.documents)
})

afterAll(async () => {
  for (const path of created) await rm(path, { recursive: true, force: true })
})

describe("what a nuke says it will delete", () => {
  it("names the default vault and the app's own directory", async () => {
    await writePreferences(DEFAULT_PREFERENCES)

    expect(await nukeTargets()).toEqual([join(paths.documents, "Tova"), paths.userData])
  })

  it("names every vault that has been added", async () => {
    const elsewhere = join(paths.documents, "another-vault")
    await mkdir(elsewhere, { recursive: true })
    await writePreferences({ ...DEFAULT_PREFERENCES, vaults: [elsewhere] })

    expect(await nukeTargets()).toContain(elsewhere)
  })

  it("refuses the home directory, however it came to be a vault", async () => {
    // A reader who once added their home as a vault should not lose it here.
    // Nothing about the button says "and everything else you own".
    await writePreferences({ ...DEFAULT_PREFERENCES, vaults: [homedir()] })

    expect(await nukeTargets()).not.toContain(homedir())
  })

  it("refuses anything above the home directory", async () => {
    await writePreferences({ ...DEFAULT_PREFERENCES, vaults: ["/", "/Users"] })
    const targets = await nukeTargets()

    expect(targets).not.toContain("/")
    expect(targets).not.toContain("/Users")
  })

  it("says nothing twice when a vault is the default one", async () => {
    const fallback = join(paths.documents, "Tova")
    await writePreferences({ ...DEFAULT_PREFERENCES, vaults: [fallback] })

    expect(await nukeTargets()).toEqual([fallback, paths.userData])
  })
})

describe("resetting the preferences", () => {
  it("puts every value back to its default", async () => {
    const { resetPreferences } = await import("./reset")
    const { readPreferences } = await import("./preferences")
    await writePreferences({
      ...DEFAULT_PREFERENCES,
      fontSize: 24,
      displayNameSource: "custom",
      displayName: "Mark",
      avatar: "tova",
      avatarColor: "#123456"
    })

    await resetPreferences()
    const after = await readPreferences()

    expect(after.fontSize).toBe(DEFAULT_PREFERENCES.fontSize)
    expect(after.displayName).toBe("")
    expect(after.avatar).toBe("initials")
    expect(after.avatarColor).toBeNull()
  })

  it("leaves the notes where they are", async () => {
    const { resetPreferences } = await import("./reset")
    const vault = join(paths.documents, "Tova", "notes")
    await mkdir(vault, { recursive: true })
    await writeFile(join(vault, "coffee.md"), "Empty streets.", "utf-8")

    await resetPreferences()

    // Reading it back is the assertion: a reset that took the notes with it
    // would be a different button entirely.
    const { readFile } = await import("fs/promises")
    expect(await readFile(join(vault, "coffee.md"), "utf-8")).toBe("Empty streets.")
  })
})

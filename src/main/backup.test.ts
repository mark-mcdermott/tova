import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { mkdtemp, rm, mkdir, access } from "fs/promises"
import { tmpdir } from "os"
import { join, sep } from "path"
import { backupFolderName } from "../shared/backup"

const paths = vi.hoisted(() => ({ documents: "" }))

vi.mock("electron", () => ({
  app: { getPath: () => paths.documents }
}))

const {
  runBackup,
  listBackups,
  restoreBackup,
  backupRoot,
  saveVersion,
  listVersions,
  readVersion
} = await import("./backup")
const { ensureVault, vaultRoot } = await import("./vault")
const { createNote, writeNote, listNotes } = await import("./notes")

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

beforeAll(async () => {
  paths.documents = await mkdtemp(join(tmpdir(), "tova-backup-"))
})

afterAll(async () => {
  await rm(paths.documents, { recursive: true, force: true })
})

beforeEach(async () => {
  await rm(vaultRoot(), { recursive: true, force: true })
  await rm(backupRoot(), { recursive: true, force: true })
  await ensureVault()
})

describe("runBackup", () => {
  it("copies the vault into a dated folder", async () => {
    await createNote({ section: "notes", title: "River" })
    const backup = await runBackup()

    expect(backup.noteCount).toBe(1)
    expect(await exists(join(backupRoot(), backup.name, "notes", "river.md"))).toBe(true)
  })

  it("keeps the backup outside the vault", async () => {
    await runBackup()
    // Note the separator: "Tova Backups" is a string prefix match against
    // "Tova", but is not a directory inside it.
    expect(backupRoot().startsWith(vaultRoot() + sep)).toBe(false)
  })

  it("never silently skips a run that collides on the same second", async () => {
    await createNote({ section: "notes", title: "River" })
    const first = await runBackup()
    const second = await runBackup()

    expect(second.name).not.toBe(first.name)
    expect(await listBackups()).toHaveLength(2)
  })

  it("prunes beyond the configured limit", async () => {
    // Seed folders directly so the limit can be exercised without waiting.
    for (let index = 0; index < 5; index++) {
      await mkdir(join(backupRoot(), backupFolderName(new Date(2026, 0, 1, 0, 0, index))), {
        recursive: true
      })
    }
    await runBackup(3)
    expect((await listBackups()).length).toBe(3)
  })

  it("prunes the oldest first", async () => {
    const oldest = backupFolderName(new Date(2026, 0, 1, 0, 0, 0))
    const newer = backupFolderName(new Date(2026, 0, 1, 0, 0, 5))
    await mkdir(join(backupRoot(), oldest), { recursive: true })
    await mkdir(join(backupRoot(), newer), { recursive: true })

    await runBackup(2)
    const names = (await listBackups()).map((backup) => backup.name)
    expect(names).not.toContain(oldest)
    expect(names).toContain(newer)
  })
})

describe("listBackups", () => {
  it("returns newest first", async () => {
    for (const seconds of [0, 30, 15]) {
      await mkdir(join(backupRoot(), backupFolderName(new Date(2026, 0, 1, 0, 0, seconds))), {
        recursive: true
      })
    }
    const names = (await listBackups()).map((backup) => backup.name)
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)))
  })

  it("returns nothing before any backup has run", async () => {
    expect(await listBackups()).toEqual([])
  })
})

describe("restoreBackup", () => {
  it("brings back a note deleted since the backup", async () => {
    await createNote({ section: "notes", title: "River" })
    const backup = await runBackup()

    await rm(join(vaultRoot(), "notes", "river.md"))
    expect(await listNotes()).toHaveLength(0)

    await restoreBackup(backup.name)
    expect((await listNotes()).map((note) => note.id)).toEqual(["notes/river.md"])
  })

  it("backs up the current vault before overwriting it", async () => {
    await createNote({ section: "notes", title: "Original" })
    const backup = await runBackup()

    await createNote({ section: "notes", title: "Written After" })
    await restoreBackup(backup.name)

    // The pre-restore state is preserved as its own backup.
    const backups = await listBackups()
    expect(backups.length).toBeGreaterThan(1)
    expect(Math.max(...backups.map((entry) => entry.noteCount))).toBe(2)
  })

  it("rejects a name that is not a backup folder", async () => {
    await expect(restoreBackup("../../etc")).rejects.toThrow()
  })

  it("rejects a backup that does not exist", async () => {
    await expect(restoreBackup(backupFolderName(new Date(2020, 0, 1)))).rejects.toThrow()
  })
})

describe("saveVersion", () => {
  it("writes a version for a note", async () => {
    await saveVersion("notes/river.md", "first", new Date(2026, 0, 1, 10, 0, 0))
    expect(await listVersions("notes/river.md")).toHaveLength(1)
  })

  it("throttles versions taken close together", async () => {
    await saveVersion("notes/river.md", "first", new Date(2026, 0, 1, 10, 0, 0))
    await saveVersion("notes/river.md", "second", new Date(2026, 0, 1, 10, 0, 30))
    expect(await listVersions("notes/river.md")).toHaveLength(1)
  })

  it("writes a new version once the interval has passed", async () => {
    await saveVersion("notes/river.md", "first", new Date(2026, 0, 1, 10, 0, 0))
    await saveVersion("notes/river.md", "second", new Date(2026, 0, 1, 10, 6, 0))
    expect(await listVersions("notes/river.md")).toHaveLength(2)
  })

  it("keeps only the ten most recent versions", async () => {
    for (let index = 0; index < 14; index++) {
      await saveVersion("notes/river.md", `body ${index}`, new Date(2026, 0, 1, index, 0, 0))
    }
    expect(await listVersions("notes/river.md")).toHaveLength(10)
  })

  it("keeps versions for different notes apart", async () => {
    await saveVersion("notes/a.md", "a", new Date(2026, 0, 1, 10, 0, 0))
    await saveVersion("notes/b.md", "b", new Date(2026, 0, 1, 10, 0, 0))

    expect(await listVersions("notes/a.md")).toHaveLength(1)
    expect(await listVersions("notes/b.md")).toHaveLength(1)
  })

  it("stores versions where the note listing cannot see them", async () => {
    await createNote({ section: "notes", title: "River" })
    await saveVersion("notes/river.md", "snapshot", new Date(2026, 0, 1, 10, 0, 0))
    expect(await listNotes()).toHaveLength(1)
  })
})

describe("readVersion", () => {
  it("returns the stored contents", async () => {
    const at = new Date(2026, 0, 1, 10, 0, 0)
    await saveVersion("notes/river.md", "the old body", at)

    const [name] = await listVersions("notes/river.md")
    expect(await readVersion("notes/river.md", name)).toBe("the old body")
  })

  it("rejects a traversal attempt", async () => {
    await expect(readVersion("notes/river.md", "../../../etc/passwd")).rejects.toThrow()
  })
})

describe("writeNote version history", () => {
  it("snapshots the previous contents before overwriting", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    await writeNote(note.id, "River", "second draft")

    const versions = await listVersions(note.id)
    expect(versions).toHaveLength(1)
    expect(await readVersion(note.id, versions[0])).not.toContain("second draft")
  })
})

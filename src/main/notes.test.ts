import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { mkdtemp, rm, readFile, access, readdir } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

// vaultRoot() reads app.getPath("documents"); the holder lets beforeAll point
// it at a scratch directory before the first call caches it.
const paths = vi.hoisted(() => ({ documents: "" }))

vi.mock("electron", () => ({
  app: { getPath: () => paths.documents }
}))

const {
  listNotes,
  renameFolder,
  deleteFolder,
  readNote,
  createNote,
  writeNote,
  moveNote,
  trashNote,
  restoreNote,
  permanentDelete,
  listFolders,
  createFolder
} = await import("./notes")
const { ensureVault, vaultRoot } = await import("./vault")

function vaultFile(...parts: string[]): string {
  return join(vaultRoot(), ...parts)
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

beforeAll(async () => {
  paths.documents = await mkdtemp(join(tmpdir(), "tova-test-"))
})

afterAll(async () => {
  await rm(paths.documents, { recursive: true, force: true })
})

beforeEach(async () => {
  await rm(vaultRoot(), { recursive: true, force: true })
  await ensureVault()
})

describe("createNote", () => {
  it("writes a file on disk", async () => {
    const note = await createNote({ section: "notes", title: "Project River" })
    expect(note.id).toBe("notes/project-river.md")
    expect(await exists(vaultFile("notes", "project-river.md"))).toBe(true)
  })

  it("records title and section in front matter", async () => {
    await createNote({ section: "notes", title: "Project River" })
    const raw = await readFile(vaultFile("notes", "project-river.md"), "utf-8")
    expect(raw).toContain("title: Project River")
    expect(raw).toContain("section: notes")
  })

  it("creates inside a folder", async () => {
    const note = await createNote({ section: "notes", folder: "ideas", title: "River" })
    expect(note.id).toBe("notes/ideas/river.md")
    expect(note.folder).toBe("ideas")
  })

  it("does not clobber a note with the same title", async () => {
    const first = await createNote({ section: "notes", title: "River" })
    const second = await createNote({ section: "notes", title: "River" })
    expect(first.id).toBe("notes/river.md")
    expect(second.id).toBe("notes/river-2.md")
  })

  it("falls back to untitled for a blank title", async () => {
    const note = await createNote({ section: "notes", title: "" })
    expect(note.id).toBe("notes/untitled.md")
  })

  it("refuses to create directly in trash", async () => {
    const note = await createNote({ section: "trash", title: "Nope" })
    expect(note.section).toBe("notes")
  })

  it("ignores a folder that tries to escape the vault", async () => {
    const note = await createNote({ section: "notes", folder: "../..", title: "Escape" })
    expect(note.id).toBe("notes/escape.md")
  })
})

describe("listNotes", () => {
  it("returns notes from every section", async () => {
    await createNote({ section: "notes", title: "Loose" })
    await createNote({ section: "notes", folder: "ideas", title: "Nested" })
    await createNote({ section: "daily", title: "Today" })

    const ids = (await listNotes()).map((note) => note.id)
    expect(ids).toContain("notes/loose.md")
    expect(ids).toContain("notes/ideas/nested.md")
    expect(ids).toContain("daily/today.md")
  })

  it("extracts tags from the body", async () => {
    const note = await createNote({ section: "notes", title: "Tagged" })
    await writeNote(note.id, "Tagged", "some #work and #writing here")

    const listed = (await listNotes()).find((entry) => entry.id === "notes/tagged.md")
    expect(listed?.tags).toEqual(["work", "writing"])
  })
})

describe("writeNote", () => {
  it("persists the body", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    await writeNote(note.id, "River", "flowing water")
    expect((await readNote("notes/river.md")).body).toBe("flowing water")
  })

  it("renames the file when the title changes", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const saved = await writeNote(note.id, "Ocean", "body")

    expect(saved.id).toBe("notes/ocean.md")
    expect(await exists(vaultFile("notes", "ocean.md"))).toBe(true)
    expect(await exists(vaultFile("notes", "river.md"))).toBe(false)
  })

  it("keeps the filename when the title is cleared", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const saved = await writeNote(note.id, "", "body")
    expect(saved.id).toBe("notes/river.md")
  })

  it("keeps a daily note's date filename when given a title", async () => {
    const note = await createNote({ section: "daily", title: "2026-09-03" })
    const saved = await writeNote(note.id, "9/3/26", "body")
    expect(saved.id).toBe("daily/2026-09-03.md")
  })

  it("does not overwrite an existing note when renamed onto its title", async () => {
    await createNote({ section: "notes", title: "Ocean" })
    const river = await createNote({ section: "notes", title: "River" })

    const saved = await writeNote(river.id, "Ocean", "body")
    expect(saved.id).toBe("notes/ocean-2.md")
    expect(await exists(vaultFile("notes", "ocean.md"))).toBe(true)
  })

  it("rejects an id pointing outside the vault", async () => {
    await expect(writeNote("../../escape.md", "x", "y")).rejects.toThrow()
  })
})

describe("trash and restore", () => {
  it("moves a note into trash", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const trashed = await trashNote(note.id)

    expect(trashed.id).toBe("trash/river.md")
    expect(trashed.section).toBe("trash")
    expect(trashed.deletedAt).not.toBeNull()
    expect(await exists(vaultFile("notes", "river.md"))).toBe(false)
    expect(await exists(vaultFile("trash", "river.md"))).toBe(true)
  })

  it("restores a loose note to the notes root", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const trashed = await trashNote(note.id)
    const restored = await restoreNote(trashed.id)

    expect(restored.id).toBe("notes/river.md")
    expect(restored.deletedAt).toBeNull()
    expect(await exists(vaultFile("trash", "river.md"))).toBe(false)
  })

  it("restores a foldered note back into its folder", async () => {
    const note = await createNote({ section: "notes", folder: "ideas", title: "River" })
    const trashed = await trashNote(note.id)
    const restored = await restoreNote(trashed.id)

    expect(restored.id).toBe("notes/ideas/river.md")
    expect(restored.folder).toBe("ideas")
  })

  it("restores a daily note to daily", async () => {
    const note = await createNote({ section: "daily", title: "2026-09-03" })
    const restored = await restoreNote((await trashNote(note.id)).id)
    expect(restored.section).toBe("daily")
  })

  it("preserves the body through a delete and restore round trip", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    await writeNote(note.id, "River", "the body survives")

    const restored = await restoreNote((await trashNote("notes/river.md")).id)
    expect((await readNote(restored.id)).body).toBe("the body survives")
  })

  it("keeps both notes when a same-named note is already in trash", async () => {
    const first = await createNote({ section: "notes", title: "River" })
    await trashNote(first.id)
    const second = await createNote({ section: "notes", title: "River" })

    expect((await trashNote(second.id)).id).toBe("trash/river-2.md")
    expect((await readdir(vaultFile("trash"))).sort()).toEqual(["river-2.md", "river.md"])
  })

  it("is a no-op on a note already in trash", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const trashed = await trashNote(note.id)
    expect((await trashNote(trashed.id)).id).toBe(trashed.id)
  })
})

describe("permanentDelete", () => {
  it("removes a trashed note from disk", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const trashed = await trashNote(note.id)

    await permanentDelete(trashed.id)
    expect(await exists(vaultFile("trash", "river.md"))).toBe(false)
  })

  it("refuses to delete a note that is not in trash", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    await expect(permanentDelete(note.id)).rejects.toThrow()
    expect(await exists(vaultFile("notes", "river.md"))).toBe(true)
  })
})

describe("moveNote", () => {
  it("moves a note into a folder", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const moved = await moveNote(note.id, { section: "notes", folder: "ideas" })

    expect(moved.id).toBe("notes/ideas/river.md")
    expect(await exists(vaultFile("notes", "ideas", "river.md"))).toBe(true)
  })

  it("moves a note back out to the notes root", async () => {
    const note = await createNote({ section: "notes", folder: "ideas", title: "River" })
    const moved = await moveNote(note.id, { section: "notes", folder: null })
    expect(moved.id).toBe("notes/river.md")
  })

  it("records the new folder so a later restore returns there", async () => {
    const note = await createNote({ section: "notes", title: "River" })
    const moved = await moveNote(note.id, { section: "notes", folder: "ideas" })
    const restored = await restoreNote((await trashNote(moved.id)).id)

    expect(restored.id).toBe("notes/ideas/river.md")
  })
})

describe("folders", () => {
  it("creates and lists folders", async () => {
    await createFolder("ideas")
    await createFolder("drafts")
    expect(await listFolders()).toEqual(["drafts", "ideas"])
  })

  it("rejects a folder name that escapes the vault", async () => {
    await expect(createFolder("../escape")).rejects.toThrow()
  })
})

describe("renameFolder", () => {
  it("moves the folder and its notes", async () => {
    await createNote({ section: "notes", folder: "ideas", title: "River" })
    await renameFolder("ideas", "thoughts")

    expect(await listFolders()).toEqual(["thoughts"])
    expect((await listNotes()).map((note) => note.id)).toEqual(["notes/thoughts/river.md"])
  })

  it("keeps note contents intact", async () => {
    const note = await createNote({ section: "notes", folder: "ideas", title: "River" })
    await writeNote(note.id, "River", "flowing water")
    await renameFolder("ideas", "thoughts")

    expect((await readNote("notes/thoughts/river.md")).body).toBe("flowing water")
  })

  it("updates front matter so a later restore lands in the new folder", async () => {
    const note = await createNote({ section: "notes", folder: "ideas", title: "River" })
    await renameFolder("ideas", "thoughts")

    const trashed = await trashNote("notes/thoughts/river.md")
    expect((await restoreNote(trashed.id)).id).toBe("notes/thoughts/river.md")
    expect(note.folder).toBe("ideas")
  })

  it("refuses to merge onto an existing folder", async () => {
    await createFolder("ideas")
    await createFolder("thoughts")
    await expect(renameFolder("ideas", "thoughts")).rejects.toThrow()
  })

  it("is a no-op when the name is unchanged", async () => {
    await createFolder("ideas")
    expect(await renameFolder("ideas", "ideas")).toBe("ideas")
  })

  it("rejects a name that escapes the vault", async () => {
    await createFolder("ideas")
    await expect(renameFolder("ideas", "../escape")).rejects.toThrow()
  })
})

describe("deleteFolder", () => {
  it("removes the folder", async () => {
    await createFolder("ideas")
    await deleteFolder("ideas")
    expect(await listFolders()).toEqual([])
  })

  it("moves contained notes to Trash rather than destroying them", async () => {
    await createNote({ section: "notes", folder: "ideas", title: "River" })
    const trashed = await deleteFolder("ideas")

    expect(trashed).toEqual(["trash/river.md"])
    expect(await exists(vaultFile("trash", "river.md"))).toBe(true)
  })

  it("keeps the body of a trashed note recoverable", async () => {
    const note = await createNote({ section: "notes", folder: "ideas", title: "River" })
    await writeNote(note.id, "River", "worth keeping")
    await deleteFolder("ideas")

    expect((await readNote("trash/river.md")).body).toBe("worth keeping")
  })

  it("recreates the folder when one of its notes is restored", async () => {
    await createNote({ section: "notes", folder: "ideas", title: "River" })
    await deleteFolder("ideas")

    const restored = await restoreNote("trash/river.md")
    expect(restored.id).toBe("notes/ideas/river.md")
  })

  it("leaves notes outside the folder alone", async () => {
    await createNote({ section: "notes", title: "Loose" })
    await createNote({ section: "notes", folder: "ideas", title: "River" })
    await deleteFolder("ideas")

    const live = (await listNotes()).filter((note) => note.section === "notes")
    expect(live.map((note) => note.id)).toEqual(["notes/loose.md"])
  })

  it("handles an empty folder", async () => {
    await createFolder("ideas")
    expect(await deleteFolder("ideas")).toEqual([])
  })

  it("rejects a name that escapes the vault", async () => {
    await expect(deleteFolder("../escape")).rejects.toThrow()
  })
})

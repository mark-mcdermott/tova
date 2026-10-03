import { describe, it, expect } from "vitest"
import { webNotes } from "./notes"
import { inMemoryNotes as fakeStore } from "../testing"
import type { StoredNote } from "../../../src/shared/noteStore"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

const asDesktopWrote = (uid: string, front: string, body: string): StoredNote => ({
  id: uid,
  text: `---\n${front}\n---\n\n${body}`,
  deleted: false
})

describe("a note the desktop wrote", () => {
  /*
   * Nothing had to be invented to join a uuid to a vault path: the desktop
   * already puts title, section and folder in front matter, so everything
   * needed to place a note travels inside the ciphertext.
   */
  it("lands where its front matter says", async () => {
    const notes = webNotes(
      fakeStore([asDesktopWrote(A, "title: River\nsection: notes\nfolder: ideas", "Water.")])
    )

    const [one] = await notes.list()

    expect(one.id).toBe("notes/ideas/river.md")
    expect(one.section).toBe("notes")
    expect(one.folder).toBe("ideas")
    expect(one.title).toBe("River")
    expect(one.uid).toBe(A)
  })

  it("comes back with its body and without its front matter", async () => {
    const notes = webNotes(
      fakeStore([asDesktopWrote(A, "title: River\nsection: notes", "Water.\n")])
    )

    expect((await notes.read("notes/river.md")).body).toBe("Water.\n")
  })

  it("carries the tags from the front matter and the prose alike", async () => {
    const notes = webNotes(
      fakeStore([asDesktopWrote(A, "title: River\nsection: notes\ntags: [water]", "#calm here")])
    )

    const [one] = await notes.list()

    expect(one.manualTags).toEqual(["water"])
    expect(one.tags).toEqual(["water", "calm"])
  })

  it("reads a favourite as one", async () => {
    const notes = webNotes(
      fakeStore([asDesktopWrote(A, 'title: River\nsection: notes\nfavorite: "true"', "")])
    )

    expect((await notes.list())[0].favorite).toBe(true)
  })
})

describe("two notes with the same title", () => {
  /*
   * A filesystem would not let two files share a name in one directory, so
   * neither does this. Which one keeps the bare slug is decided by uid rather
   * than by iteration order — two devices do not share an iteration order, and
   * a note whose path depended on one would move about.
   */
  it("are given different paths, and the same ones on any device", async () => {
    const both = [
      asDesktopWrote(B, "title: River\nsection: notes", ""),
      asDesktopWrote(A, "title: River\nsection: notes", "")
    ]
    const paths = async (notes: StoredNote[]) =>
      Object.fromEntries((await webNotes(fakeStore(notes)).list()).map((one) => [one.uid, one.id]))

    const forward = await paths(both)
    const backward = await paths([...both].reverse())

    expect(new Set(Object.values(forward)).size).toBe(2)
    /*
     * Which uid got which path, not merely which paths exist. Comparing the
     * sorted lists passes even when the two devices swapped them — and a note
     * whose path depends on the order its device happened to read storage in
     * is a note that moves about.
     */
    expect(forward).toEqual(backward)
  })

  it("share a path when they are in different folders", async () => {
    const notes = webNotes(
      fakeStore([
        asDesktopWrote(A, "title: River\nsection: notes\nfolder: ideas", ""),
        asDesktopWrote(B, "title: River\nsection: journal", "")
      ])
    )

    expect((await notes.list()).map((one) => one.id).sort()).toEqual([
      "journal/river.md",
      "notes/ideas/river.md"
    ])
  })
})

describe("writing", () => {
  it("makes a note and reads it straight back", async () => {
    const store = fakeStore()
    const notes = webNotes(store)

    const made = await notes.create({ section: "notes", title: "River", body: "Water." })

    expect(made.id).toBe("notes/river.md")
    expect((await notes.read("notes/river.md")).body).toBe("Water.")
    expect(store.held.size).toBe(1)
  })

  /*
   * A path is derived rather than stored, so renaming changes it — exactly as
   * on the desktop, where the file is renamed under the note. The uid is what
   * does not move, which is what the sync keys by.
   */
  it("moves a note's path when its title changes, and not its identity", async () => {
    const notes = webNotes(fakeStore())
    const made = await notes.create({ section: "notes", title: "River" })

    const renamed = await notes.rename(made.id, "Estuary")

    expect(renamed.id).toBe("notes/estuary.md")
    expect(renamed.uid).toBe(made.uid)
  })

  it("keeps the body when only the title changed", async () => {
    const notes = webNotes(fakeStore())
    const made = await notes.create({ section: "notes", title: "River", body: "Water." })

    const renamed = await notes.rename(made.id, "Estuary")

    expect((await notes.read(renamed.id)).body).toBe("Water.")
  })

  it("writes only the keys the desktop knows, so a save there loses nothing", async () => {
    const store = fakeStore()
    const notes = webNotes(store)

    const made = await notes.create({ section: "notes", title: "River", body: "Water." })
    await notes.setTags(made.id, ["water"])
    await notes.setFavorite("notes/river.md", true)

    const front = [...store.held.values()][0].text.split("---")[1]
    const keys = [...front.matchAll(/^(\w+):/gm)].map((match) => match[1]).sort()

    expect(keys).toEqual(["favorite", "section", "tags", "title", "uid"])
  })
})

describe("the trash", () => {
  it("moves a removed note there without losing it", async () => {
    const store = fakeStore()
    const notes = webNotes(store)
    const made = await notes.create({ section: "notes", title: "River", body: "Water." })

    const gone = await notes.remove(made.id)

    expect(gone.section).toBe("trash")
    expect(gone.deletedAt).not.toBeNull()
    expect(store.held.size).toBe(1)
  })

  /*
   * A tombstone, not a delete. The row still has to travel or the other device
   * pushes the note straight back.
   */
  it("keeps the row, so the deletion can travel", async () => {
    const store = fakeStore()
    const notes = webNotes(store)
    const made = await notes.create({ section: "notes", title: "River" })

    await notes.remove(made.id)

    expect([...store.held.values()][0].deleted).toBe(true)
  })

  /*
   * The Trash is flat. A note that kept its folder while deleted would show up
   * under a folder in the sidebar and in the Trash at once.
   */
  it("shows no folder while it is in the trash, and its own again after", async () => {
    const notes = webNotes(fakeStore())
    const made = await notes.create({ section: "notes", folder: "ideas", title: "River" })

    const gone = await notes.remove(made.id)
    expect(gone.folder).toBeNull()
    expect(gone.id).toBe("trash/river.md")

    expect((await notes.restore(gone.id)).folder).toBe("ideas")
  })

  it("brings one back where its front matter says it lived", async () => {
    const notes = webNotes(fakeStore())
    const made = await notes.create({ section: "journal", title: "River" })
    const gone = await notes.remove(made.id)

    const back = await notes.restore(gone.id)

    expect(back.section).toBe("journal")
    expect(back.id).toBe("journal/river.md")
  })
})

describe("folders", () => {
  it("lists the ones notes are actually in, once each", async () => {
    const notes = webNotes(
      fakeStore([
        asDesktopWrote(A, "title: One\nsection: notes\nfolder: ideas", ""),
        asDesktopWrote(B, "title: Two\nsection: notes\nfolder: ideas", "")
      ])
    )

    expect(await notes.listFolders()).toEqual(["ideas"])
  })
})

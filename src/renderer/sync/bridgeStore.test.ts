import { describe, it, expect, vi } from "vitest"
import { bridgeNoteStore } from "./bridgeStore"
import type { Note, NoteSummary, TovaBridge } from "../../shared/types"

const A = "11111111-1111-4111-8111-111111111111"

const summary = (over: Partial<NoteSummary> = {}): NoteSummary => ({
  id: "notes/river.md",
  uid: A,
  title: "River",
  section: "notes",
  folder: null,
  tags: [],
  manualTags: [],
  favorite: false,
  updatedAt: 0,
  createdAt: 0,
  deletedAt: null,
  ...over
})

/**
 * A desktop that already has notes, with only the methods this store calls.
 *
 * The rest of the bridge is cast away rather than stubbed: a store reaching
 * for something not here should fail loudly in a test, not quietly answer.
 */
function fakeBridge(
  notes: { summary: NoteSummary; body: string }[] = [],
  over: Partial<TovaBridge["notes"]> = {}
) {
  const held = [...notes]
  let state: unknown = null

  const find = (id: string) => {
    const found = held.find((one) => one.summary.id === id)
    if (found === undefined) throw new Error(`no note at ${id}`)
    return found
  }

  const bridge = {
    notes: {
      list: async () => held.map((one) => one.summary),
      read: async (id: string): Promise<Note> => ({ ...find(id).summary, body: find(id).body }),
      write: async (id: string, title: string, body: string) => {
        const one = find(id)
        one.summary = { ...one.summary, title }
        one.body = body
        return one.summary
      },
      create: vi.fn(async () => ({ ...summary(), body: "" })),
      /*
       * The real one moves the file, so the note's id changes with it — a path
       * is where a note is. A fake that kept the id would forgive writing to a
       * note that had already moved, which is the ordering bug this is here to
       * catch.
       */
      remove: async (id: string) => {
        const one = find(id)
        const filename = one.summary.id.split("/").pop()
        one.summary = { ...one.summary, section: "trash", folder: null, id: `trash/${filename}` }
        return one.summary
      },
      restore: async (id: string) => {
        const one = find(id)
        const filename = one.summary.id.split("/").pop()
        one.summary = { ...one.summary, section: "notes", id: `notes/${filename}` }
        return one.summary
      },
      ...over
    },
    sync: {
      state: async () => state,
      setState: async (value: unknown) => void (state = value)
    }
  } as unknown as TovaBridge

  return { bridge, held, created: bridge.notes.create }
}

describe("reading the vault as a sync sees it", () => {
  it("keys by uid, not by path", async () => {
    const { bridge } = fakeBridge([{ summary: summary(), body: "Water." }])

    const [note] = await bridgeNoteStore(bridge).all()

    expect(note.id).toBe(A)
    expect(note.deleted).toBe(false)
  })

  it("rebuilds the text the desktop would have written", async () => {
    const { bridge } = fakeBridge([
      { summary: summary({ folder: "ideas", manualTags: ["water"], favorite: true }), body: "W." }
    ])

    const [note] = await bridgeNoteStore(bridge).all()

    expect(note.text).toBe(
      "---\ntitle: River\nsection: notes\nfolder: ideas\nfavorite: true\ntags: [water]\nuid: " +
        A +
        "\n---\n\nW."
    )
  })

  it("reads a note in the trash as a tombstone", async () => {
    const { bridge } = fakeBridge([
      { summary: summary({ section: "trash", id: "trash/river.md" }), body: "" }
    ])

    expect((await bridgeNoteStore(bridge).all())[0].deleted).toBe(true)
  })

  /*
   * `docs/SYNC.md`: ids are minted at first sync, not swept. A sweep rewrites
   * the files of everybody who never turns sync on, for their trouble, and
   * they get nothing from it. Writing the note back is what mints one.
   */
  it("mints an id for a note written before ids existed", async () => {
    const { bridge, held } = fakeBridge([{ summary: summary({ uid: undefined }), body: "W." }])
    const write = vi.spyOn(bridge.notes, "write")
    // The desktop mints on save, so the fake does what the real one does.
    write.mockImplementation(async (id, title) => {
      const one = held.find((each) => each.summary.id === id)!
      one.summary = { ...one.summary, title, uid: A }
      return one.summary
    })

    const [note] = await bridgeNoteStore(bridge).all()

    expect(write).toHaveBeenCalled()
    expect(note.id).toBe(A)
  })
})

describe("writing what a sync pulled", () => {
  it("updates a note it already has, by uid", async () => {
    const { bridge, held } = fakeBridge([{ summary: summary(), body: "old" }])

    await bridgeNoteStore(bridge).write({
      id: A,
      text: "---\ntitle: River\nsection: notes\n---\n\nnew",
      deleted: false
    })

    expect(held[0].body).toBe("new")
  })

  it("creates one it has never seen, where its front matter says", async () => {
    const { bridge, created } = fakeBridge()

    await bridgeNoteStore(bridge).write({
      id: A,
      text: "---\ntitle: River\nsection: journal\nfolder: ideas\n---\n\nW.",
      deleted: false
    })

    expect(created).toHaveBeenCalledWith({
      section: "journal",
      folder: "ideas",
      title: "River",
      body: "W."
    })
  })

  /*
   * The content first, then the tombstone. A note that arrives deleted and is
   * written straight into the Trash looks like somebody put it there, and its
   * last edit never lands.
   */
  it("writes a deleted note's content before throwing it away", async () => {
    const { bridge, held } = fakeBridge([{ summary: summary(), body: "old" }])

    await bridgeNoteStore(bridge).write({
      id: A,
      text: "---\ntitle: River\nsection: notes\n---\n\nlast words",
      deleted: true
    })

    expect(held[0].body).toBe("last words")
    expect(held[0].summary.section).toBe("trash")
  })

  it("brings one back out of the trash when it arrives alive", async () => {
    const { bridge, held } = fakeBridge([
      { summary: summary({ section: "trash", id: "trash/river.md" }), body: "W." }
    ])

    await bridgeNoteStore(bridge).write({
      id: A,
      text: "---\ntitle: River\nsection: notes\n---\n\nW.",
      deleted: false
    })

    expect(held[0].summary.section).toBe("notes")
  })
})

describe("what the backend keeps between runs", () => {
  it("starts from nothing", async () => {
    const store = bridgeNoteStore(fakeBridge().bridge)

    expect(await store.cursor()).toBe(0n)
    expect(await store.agreed()).toEqual({})
  })

  /*
   * JSON has no bigint, so a version goes through as a string. Read back as
   * one it would compare wrongly and silently — `"10" < "9"` is true.
   */
  it("carries a version through JSON and back as a bigint", async () => {
    const store = bridgeNoteStore(fakeBridge().bridge)

    await store.setCursor(10n)
    await store.agree(A, { version: 10n, text: "W.", deleted: false })

    expect(await store.cursor()).toBe(10n)
    expect((await store.agreed())[A].version).toBe(10n)
  })

  /*
   * Both orders, because each only sees one of the two ways this goes wrong.
   * Agreeing after setting a cursor cannot notice a cursor that wipes the
   * agreements; setting one after agreeing is the only way round that does.
   */
  it("keeps the cursor when an agreement is recorded", async () => {
    const store = bridgeNoteStore(fakeBridge().bridge)

    await store.setCursor(7n)
    await store.agree(A, { version: 3n, text: "W.", deleted: false })

    expect(await store.cursor()).toBe(7n)
    expect(Object.keys(await store.agreed())).toEqual([A])
  })

  it("keeps the agreements when the cursor moves", async () => {
    const store = bridgeNoteStore(fakeBridge().bridge)

    await store.agree(A, { version: 3n, text: "W.", deleted: false })
    await store.setCursor(7n)

    expect(Object.keys(await store.agreed())).toEqual([A])
    expect(await store.cursor()).toBe(7n)
  })

  it("reads nonsense as nothing rather than throwing", async () => {
    const { bridge } = fakeBridge()
    await bridge.sync.setState("not a state at all")

    expect(await bridgeNoteStore(bridge).cursor()).toBe(0n)
  })
})

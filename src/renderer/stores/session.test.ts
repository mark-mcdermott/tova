import { describe, it, expect, vi, beforeEach } from "vitest"
import { useNotesStore } from "./notesStore"
import { emptyHistory } from "./history"
import { stubBridge } from "../testing/bridge"

const read = vi.fn()
const sessionRead = vi.fn()
const list = vi.fn(async () => [])
const listFolders = vi.fn(async () => [])
const today = vi.fn()

const note = (id: string) => ({
  id,
  title: "Alpha",
  section: "notes",
  folder: null,
  tags: [],
  favorite: false,
  updatedAt: 0,
  createdAt: 0,
  deletedAt: null,
  body: ""
})

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge({
    notes: { read, list, listFolders, today },
    session: { read: sessionRead, write: vi.fn() }
  })
  today.mockResolvedValue(note("daily/2026-09-10.md"))
  useNotesStore.setState({
    notes: [],
    activeId: null,
    active: null,
    indexTarget: null,
    view: "editor",
    history: emptyHistory
  })
})

describe("reopening where you were", () => {
  it("opens the note the app was last on", async () => {
    sessionRead.mockResolvedValue({ kind: "note", noteId: "notes/river.md" })
    read.mockResolvedValue(note("notes/river.md"))

    await useNotesStore.getState().load()

    expect(useNotesStore.getState().activeId).toBe("notes/river.md")
    expect(today).not.toHaveBeenCalled()
  })

  it("opens the listing the app was last on", async () => {
    sessionRead.mockResolvedValue({ kind: "index", target: { kind: "section", section: "ideas" } })

    await useNotesStore.getState().load()
    const state = useNotesStore.getState()

    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "section", section: "ideas" })
    expect(today).not.toHaveBeenCalled()
  })

  it("falls back to today when the remembered note is gone", async () => {
    // Deleted between launches. That should cost you today's note, not an error.
    sessionRead.mockResolvedValue({ kind: "note", noteId: "notes/deleted.md" })
    read.mockRejectedValue(new Error("ENOENT"))

    await useNotesStore.getState().load()

    expect(today).toHaveBeenCalled()
    expect(useNotesStore.getState().error).toBeNull()
  })

  it("opens today on a first launch, as it always did", async () => {
    sessionRead.mockResolvedValue(null)

    await useNotesStore.getState().load()
    expect(today).toHaveBeenCalled()
  })

  it("puts the reopened note in history, so back has somewhere to start", async () => {
    sessionRead.mockResolvedValue({ kind: "note", noteId: "notes/river.md" })
    read.mockResolvedValue(note("notes/river.md"))

    await useNotesStore.getState().load()
    const { history } = useNotesStore.getState()

    expect(history.entries).toHaveLength(1)
    expect(history.entries[0].screen).toEqual({ kind: "note", noteId: "notes/river.md" })
  })
})

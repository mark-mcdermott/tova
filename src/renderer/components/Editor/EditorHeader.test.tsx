import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorHeader } from "./EditorHeader"
import { useNotesStore } from "../../stores/notesStore"
import { stubBridge } from "../../testing/bridge"
import { emptyHistory, push } from "../../stores/history"
import { Note } from "../../../shared/types"

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "notes/river.md",
    title: "Project River",
    section: "notes",
    folder: null,
    tags: [],
    favorite: false,
    updatedAt: 0,
    createdAt: 0,
    deletedAt: null,
    body: "",
    ...overrides
  }
}

const read = vi.fn()
const exportMarkdown = vi.fn()
const move = vi.fn()
const remove = vi.fn()
const setFavorite = vi.fn()

function renderHeader(active: Note = note()) {
  return render(
    <EditorHeader
      note={active}
      title={active.title}
      onTitleChange={() => undefined}
      onTitleCommit={() => undefined}
      onAddTag={() => undefined}
      tagAddRef={{ current: null }}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge({ notes: { read, exportMarkdown, move, remove, setFavorite } })
  useNotesStore.setState({
    folders: ["ideas", "drafts"],
    focusTitleSeq: 0,
    history: emptyHistory,
    sidebarCollapsed: false,
    expanded: { folders: true, tags: true, notes: true, daily: true },
    openSeq: 0,
    error: null
  })
})

afterEach(cleanup)

describe("EditorHeader navigation", () => {
  it("draws no back arrow with nowhere to go", () => {
    // It used to sit greyed out, which is a control announcing it does nothing.
    renderHeader()
    expect(screen.queryByLabelText("Back")).toBeNull()
  })

  it("shows back once a second note has been opened", () => {
    useNotesStore.setState({
      history: push(push(emptyHistory, { kind: "note", noteId: "notes/a.md" }), {
        kind: "note",
        noteId: "notes/b.md"
      })
    })
    renderHeader()
    expect(screen.getByLabelText("Back")).toBeDefined()
  })

  it("hides forward until the user has gone back", () => {
    useNotesStore.setState({
      history: push(push(emptyHistory, { kind: "note", noteId: "notes/a.md" }), {
        kind: "note",
        noteId: "notes/b.md"
      })
    })
    renderHeader()
    expect(screen.queryByLabelText("Forward")).toBeNull()
  })

  it("shows forward after going back", async () => {
    read.mockResolvedValue(note({ id: "notes/a.md" }))
    useNotesStore.setState({
      history: push(push(emptyHistory, { kind: "note", noteId: "notes/a.md" }), {
        kind: "note",
        noteId: "notes/b.md"
      })
    })
    renderHeader()

    await userEvent.setup().click(screen.getByLabelText("Back"))
    await waitFor(() => expect(screen.getByLabelText("Forward")).toBeDefined())
  })

  it("loads the previous note when back is used", async () => {
    read.mockResolvedValue(note({ id: "notes/a.md" }))
    useNotesStore.setState({
      history: push(push(emptyHistory, { kind: "note", noteId: "notes/a.md" }), {
        kind: "note",
        noteId: "notes/b.md"
      })
    })
    renderHeader()

    await userEvent.setup().click(screen.getByLabelText("Back"))
    expect(read).toHaveBeenCalledWith("notes/a.md")
  })
})

describe("EditorHeader breadcrumb", () => {
  it("renders section and title", () => {
    renderHeader()
    expect(screen.getByRole("button", { name: "Notes" })).toBeDefined()
    expect(screen.getByText("Project River")).toBeDefined()
  })

  it("includes the folder for a nested note", () => {
    renderHeader(note({ folder: "ideas" }))
    expect(screen.getByRole("button", { name: "ideas" })).toBeDefined()
  })

  it("leaves the note title unlinked", () => {
    renderHeader()
    expect(screen.queryByRole("button", { name: "Project River" })).toBeNull()
  })

  it("opens the section's listing when its crumb is clicked", async () => {
    // It used to expand the row in the sidebar and leave you on the note: a
    // control that looked like a link, read like a link, and went nowhere.
    renderHeader()

    await userEvent.setup().click(screen.getByRole("button", { name: "Notes" }))
    const state = useNotesStore.getState()

    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "section", section: "notes" })
  })

  it("opens the folder's listing from a folder crumb", async () => {
    renderHeader(note({ folder: "ideas" }))

    await userEvent.setup().click(screen.getByRole("button", { name: "ideas" }))
    const state = useNotesStore.getState()

    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "folder", folder: "ideas" })
  })

  it("opens a blog's listing rather than the generic Posts section", async () => {
    renderHeader(note({ section: "posts", folder: "markmcdermott.io" }))

    await userEvent.setup().click(screen.getByRole("button", { name: "markmcdermott.io" }))
    expect(useNotesStore.getState().indexTarget).toEqual({
      kind: "blog",
      blog: "markmcdermott.io"
    })
  })

  it("leaves a collapsed sidebar collapsed", async () => {
    // Reopening it was a side effect of revealing the row. Navigating is the
    // whole job now, and App keeps its own control for reopening the rail.
    useNotesStore.setState({ sidebarCollapsed: true })
    renderHeader()

    await userEvent.setup().click(screen.getByRole("button", { name: "Notes" }))
    expect(useNotesStore.getState().sidebarCollapsed).toBe(true)
  })
})

describe("EditorHeader note menu", () => {
  async function openMenu(active: Note = note()) {
    const user = userEvent.setup()
    renderHeader(active)
    await user.click(screen.getByLabelText("Note actions"))
    return user
  }

  it("offers the full set for a regular note", async () => {
    await openMenu()
    for (const label of ["Rename", "Move to…", "Export .md", "Delete → Trash"]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeDefined()
    }
  })

  it("omits Move for a daily note, whose filename is its date", async () => {
    await openMenu(note({ section: "daily", title: "9/4/26" }))
    expect(screen.queryByRole("menuitem", { name: "Move to…" })).toBeNull()
    expect(screen.getByRole("menuitem", { name: "Export .md" })).toBeDefined()
  })

  it("offers recovery for a trashed note", async () => {
    await openMenu(note({ section: "trash" }))
    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Delete permanently" })).toBeDefined()
    expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull()
  })

  it("focuses the title when Rename is chosen", async () => {
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Rename" }))
    expect(useNotesStore.getState().focusTitleSeq).toBe(1)
  })

  it("exports through the bridge", async () => {
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Export .md" }))
    expect(exportMarkdown).toHaveBeenCalledWith("notes/river.md")
  })

  it("swaps in the folder list for Move to…", async () => {
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Move to…" }))

    expect(screen.getByRole("menuitem", { name: "ideas" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "drafts" })).toBeDefined()
  })

  it("does not offer the folder the note is already in", async () => {
    const user = await openMenu(note({ folder: "ideas" }))
    await user.click(screen.getByRole("menuitem", { name: "Move to…" }))

    expect(screen.queryByRole("menuitem", { name: "ideas" })).toBeNull()
    expect(screen.getByRole("menuitem", { name: "Notes" })).toBeDefined()
  })

  it("moves the note to the chosen folder", async () => {
    move.mockResolvedValue({ ...note({ folder: "ideas" }), id: "notes/ideas/river.md" })
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Move to…" }))
    await user.click(screen.getByRole("menuitem", { name: "ideas" }))

    expect(move).toHaveBeenCalledWith("notes/river.md", { section: "notes", folder: "ideas" })
  })

  it("offers the flat sections even when there are no folders", async () => {
    useNotesStore.setState({ folders: [] })
    const user = await openMenu()
    await user.click(screen.getByRole("menuitem", { name: "Move to…" }))

    for (const label of ["Ideas", "Journal"]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeDefined()
    }
  })

  it("does not offer the section the note already sits in", async () => {
    useNotesStore.setState({ folders: [] })
    const user = await openMenu(note({ section: "journal" }))
    await user.click(screen.getByRole("menuitem", { name: "Move to…" }))

    expect(screen.queryByRole("menuitem", { name: "Journal" })).toBeNull()
    expect(screen.getByRole("menuitem", { name: "Ideas" })).toBeDefined()
    // A note outside Notes can always come back to it.
    expect(screen.getByRole("menuitem", { name: "Notes" })).toBeDefined()
  })
})

describe("EditorHeader edited time", () => {
  it("reports how long ago the note was written", () => {
    const twoMinutes = Date.now() - 2 * 60_000
    renderHeader(note({ updatedAt: twoMinutes }))
    expect(screen.getByText("Edited 2m ago")).toBeDefined()
  })

  it("reads as just now for a fresh save", () => {
    renderHeader(note({ updatedAt: Date.now() }))
    expect(screen.getByText("Edited just now")).toBeDefined()
  })

  it("keeps the actions menu reachable beside it", async () => {
    renderHeader()
    await userEvent.setup().click(screen.getByLabelText("Note actions"))
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeDefined()
  })
})

describe("EditorHeader favourite", () => {
  it("offers to add when the note is not a favourite", () => {
    renderHeader(note({ favorite: false }))
    expect(screen.getByLabelText("Add to favourites")).toBeDefined()
  })

  it("offers to remove when it is", () => {
    renderHeader(note({ favorite: true }))
    expect(screen.getByLabelText("Remove from favourites")).toBeDefined()
  })

  it("reports its state to assistive technology", () => {
    renderHeader(note({ favorite: true }))
    expect(screen.getByLabelText("Remove from favourites").getAttribute("aria-pressed")).toBe(
      "true"
    )
  })

  it("toggles through the bridge", async () => {
    setFavorite.mockResolvedValue({ ...note({ favorite: true }) })
    renderHeader(note({ favorite: false }))

    await userEvent.setup().click(screen.getByLabelText("Add to favourites"))
    expect(setFavorite).toHaveBeenCalledWith("notes/river.md", true)
  })

  it("unpins a note that is already pinned", async () => {
    setFavorite.mockResolvedValue({ ...note({ favorite: false }) })
    useNotesStore.setState({ notes: [note({ favorite: true })] })
    renderHeader(note({ favorite: true }))

    await userEvent.setup().click(screen.getByLabelText("Remove from favourites"))
    expect(setFavorite).toHaveBeenCalledWith("notes/river.md", false)
  })
})

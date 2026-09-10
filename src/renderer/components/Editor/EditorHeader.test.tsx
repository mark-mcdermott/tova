import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { ReactNode } from "react"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorHeader } from "./EditorHeader"
import { useNotesStore } from "../../stores/notesStore"
import { stubBridge } from "../../testing/bridge"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { DEFAULT_PREFERENCES, Preferences } from "../../../shared/preferences"
import { emptyHistory, push } from "../../stores/history"
import { Note } from "../../../shared/types"

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "notes/river.md",
    title: "Project River",
    section: "notes",
    folder: null,
    tags: [],
    manualTags: [],
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

function renderHeader(active: Note = note(), find?: ReactNode) {
  return render(
    <EditorHeader
      note={active}
      title={active.title}
      onTitleChange={() => undefined}
      onTitleCommit={() => undefined}
      onAddTag={() => undefined}
      onRemoveTag={() => undefined}
      onOpenTag={() => undefined}
      find={find}
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

describe("favouriting from the note menu", () => {
  // It used to be a star beside the ... button. The theme control took that
  // spot, so it joined Rename — the other item about the note rather than its
  // text — instead of being lost.
  async function openMenu(active: Note) {
    const user = userEvent.setup()
    renderHeader(active)
    await user.click(screen.getByLabelText("Note actions"))
    return user
  }

  it("offers to add when the note is not a favourite", async () => {
    await openMenu(note({ favorite: false }))
    expect(screen.getByRole("menuitem", { name: "Add to favourites" })).toBeDefined()
  })

  it("offers to remove when it is", async () => {
    await openMenu(note({ favorite: true }))
    expect(screen.getByRole("menuitem", { name: "Remove from favourites" })).toBeDefined()
  })

  it("toggles through the bridge", async () => {
    setFavorite.mockResolvedValue({ ...note({ favorite: true }) })
    const user = await openMenu(note({ favorite: false }))

    await user.click(screen.getByRole("menuitem", { name: "Add to favourites" }))
    expect(setFavorite).toHaveBeenCalledWith("notes/river.md", true)
  })

  it("unpins a note that is already pinned", async () => {
    setFavorite.mockResolvedValue({ ...note({ favorite: false }) })
    useNotesStore.setState({ notes: [note({ favorite: true })] })
    const user = await openMenu(note({ favorite: true }))

    await user.click(screen.getByRole("menuitem", { name: "Remove from favourites" }))
    expect(setFavorite).toHaveBeenCalledWith("notes/river.md", false)
  })

  it("is not offered on a trashed note, whose menu is about getting it back", async () => {
    await openMenu(note({ section: "trash", deletedAt: 1 }))
    expect(screen.queryByRole("menuitem", { name: /favourites/ })).toBeNull()
  })
})

describe("the appearance button", () => {
  const iconOf = () =>
    screen
      .getByLabelText(/^Appearance:/)
      .querySelector("svg")
      ?.getAttribute("class")

  it("shows the mode you are on, not the one you would get", async () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES, theme: "dark" } })
    renderHeader()

    expect(screen.getByLabelText(/^Appearance: Dark/)).toBeDefined()
    expect(iconOf()).toBeDefined()
  })

  it("steps light to dark to system and round again", async () => {
    const write = vi.fn(async (value: Preferences) => value)
    window.tova = stubBridge({
      notes: { read, exportMarkdown, move, remove, setFavorite },
      preferences: { write }
    })

    for (const [from, to] of [
      ["light", "dark"],
      ["dark", "system"],
      ["system", "light"]
    ] as const) {
      cleanup()
      write.mockClear()
      usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES, theme: from } })
      renderHeader()

      await userEvent.setup().click(screen.getByLabelText(/^Appearance:/))
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ theme: to }))
    }
  })

  it("says what a click will do, since the icon only says where you are", () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES, theme: "system" } })
    renderHeader()

    expect(screen.getByLabelText("Appearance: System. Change to Light")).toBeDefined()
  })
})

describe("deleting from the note menu leaves the note", () => {
  async function openMenuOn(active: Note) {
    const user = userEvent.setup()
    renderHeader(active)
    await user.click(screen.getByLabelText("Note actions"))
    return user
  }

  it("goes up to the folder the note lived in", async () => {
    // Deleting the note you are reading used to leave you reading it, with the
    // breadcrumb quietly changed to Trash and nothing else different.
    remove.mockResolvedValue({ ...note({ folder: "ideas" }), section: "trash", deletedAt: 1 })
    const user = await openMenuOn(note({ folder: "ideas" }))

    await user.click(screen.getByRole("menuitem", { name: "Delete → Trash" }))
    const state = useNotesStore.getState()

    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "folder", folder: "ideas" })
  })

  it("goes up to the section for a loose note", async () => {
    remove.mockResolvedValue({ ...note(), section: "trash", deletedAt: 1 })
    const user = await openMenuOn(note())

    await user.click(screen.getByRole("menuitem", { name: "Delete → Trash" }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "section", section: "notes" })
  })

  it("leaves a permanently deleted note too, since it is gone entirely", async () => {
    const user = await openMenuOn(note({ section: "trash", deletedAt: 1 }))

    await user.click(screen.getByRole("menuitem", { name: "Delete permanently" }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "section", section: "trash" })
  })

  it("offers Export .pdf once, not twice", async () => {
    // It was listed twice for a trashed note before this change.
    await openMenuOn(note({ section: "trash", deletedAt: 1 }))
    expect(screen.getAllByRole("menuitem", { name: "Export .pdf" })).toHaveLength(1)
  })
})

describe("finding in the note", () => {
  it("draws the bar under the nav row, not over the title", () => {
    // A bar laid over the header would cover a long title, and the one thing a
    // find bar must never do is hide the words being searched.
    renderHeader(note(), <div data-testid="find-bar" />)

    const header = document.querySelector(".editor-header")
    const nav = header?.querySelector(".editor-nav")
    expect(nav?.nextElementSibling?.getAttribute("data-testid")).toBe("find-bar")
  })

  it("draws nothing there when the bar is closed", () => {
    renderHeader()
    expect(screen.queryByTestId("find-bar")).toBeNull()
  })
})

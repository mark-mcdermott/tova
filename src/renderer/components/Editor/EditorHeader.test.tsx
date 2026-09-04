import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorHeader } from "./EditorHeader"
import { useNotesStore } from "../../stores/notesStore"
import { emptyHistory, push } from "../../stores/history"
import { Note } from "../../../shared/types"

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "notes/river.md",
    title: "Project River",
    section: "notes",
    folder: null,
    tags: [],
    updatedAt: 0,
    deletedAt: null,
    body: "",
    ...overrides
  }
}

const read = vi.fn()

function renderHeader(active: Note = note()) {
  return render(
    <EditorHeader
      note={active}
      title={active.title}
      onTitleChange={() => undefined}
      onTitleCommit={() => undefined}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = {
    notes: { read } as never,
    backups: {} as never,
    events: { onNotesChanged: vi.fn(() => () => undefined) }
  }
  useNotesStore.setState({
    history: emptyHistory,
    sidebarCollapsed: false,
    expanded: { folders: true, tags: true, notes: true, daily: true },
    openSeq: 0,
    error: null
  })
})

afterEach(cleanup)

describe("EditorHeader navigation", () => {
  it("disables back with nowhere to go", () => {
    renderHeader()
    expect(screen.getByLabelText("Back")).toHaveProperty("disabled", true)
  })

  it("enables back once a second note has been opened", () => {
    useNotesStore.setState({
      history: push(push(emptyHistory, "notes/a.md"), "notes/b.md")
    })
    renderHeader()
    expect(screen.getByLabelText("Back")).toHaveProperty("disabled", false)
  })

  it("hides forward until the user has gone back", () => {
    useNotesStore.setState({
      history: push(push(emptyHistory, "notes/a.md"), "notes/b.md")
    })
    renderHeader()
    expect(screen.queryByLabelText("Forward")).toBeNull()
  })

  it("shows forward after going back", async () => {
    read.mockResolvedValue(note({ id: "notes/a.md" }))
    useNotesStore.setState({
      history: push(push(emptyHistory, "notes/a.md"), "notes/b.md")
    })
    renderHeader()

    await userEvent.setup().click(screen.getByLabelText("Back"))
    await waitFor(() => expect(screen.getByLabelText("Forward")).toBeDefined())
  })

  it("loads the previous note when back is used", async () => {
    read.mockResolvedValue(note({ id: "notes/a.md" }))
    useNotesStore.setState({
      history: push(push(emptyHistory, "notes/a.md"), "notes/b.md")
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

  it("reveals a collapsed section when its crumb is clicked", async () => {
    useNotesStore.setState({ expanded: { folders: true } })
    renderHeader()

    await userEvent.setup().click(screen.getByRole("button", { name: "Notes" }))
    expect(useNotesStore.getState().expanded.notes).toBe(true)
  })

  it("reveals the parent section alongside a folder crumb", async () => {
    useNotesStore.setState({ expanded: { folders: true } })
    renderHeader(note({ folder: "ideas" }))

    await userEvent.setup().click(screen.getByRole("button", { name: "ideas" }))
    const { expanded } = useNotesStore.getState()
    expect(expanded["folder:ideas"]).toBe(true)
    expect(expanded.notes).toBe(true)
  })

  it("reopens a collapsed sidebar when a crumb is clicked", async () => {
    useNotesStore.setState({ sidebarCollapsed: true })
    renderHeader()

    await userEvent.setup().click(screen.getByRole("button", { name: "Notes" }))
    expect(useNotesStore.getState().sidebarCollapsed).toBe(false)
  })
})

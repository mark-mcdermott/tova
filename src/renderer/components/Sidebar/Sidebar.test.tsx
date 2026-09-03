import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Sidebar } from "./Sidebar"
import { useNotesStore } from "../../stores/notesStore"
import { NoteSummary } from "../../../shared/types"

const notes: NoteSummary[] = [
  {
    id: "notes/ideas/river.md",
    title: "Project River",
    section: "notes",
    folder: "ideas",
    tags: ["writing", "work"],
    updatedAt: 5,
    deletedAt: null
  },
  {
    id: "notes/loose.md",
    title: "Loose Note",
    section: "notes",
    folder: null,
    tags: ["work"],
    updatedAt: 4,
    deletedAt: null
  },
  {
    id: "daily/2026-09-03.md",
    title: "9/3/26",
    section: "daily",
    folder: null,
    tags: [],
    updatedAt: 3,
    deletedAt: null
  },
  {
    id: "trash/old.md",
    title: "Old Draft",
    section: "trash",
    folder: null,
    tags: ["work"],
    updatedAt: 2,
    deletedAt: 2
  }
]

const bridge = {
  list: vi.fn(),
  listFolders: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  today: vi.fn(),
  permanentDelete: vi.fn(),
  createFolder: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = {
    notes: bridge,
    backups: {
      run: vi.fn(),
      list: vi.fn(),
      restore: vi.fn(),
      status: vi.fn(),
      listVersions: vi.fn(),
      readVersion: vi.fn()
    }
  }
  useNotesStore.setState({
    notes,
    folders: ["ideas", "drafts"],
    activeId: null,
    active: null,
    openSeq: 0,
    loading: false,
    error: null
  })
})

afterEach(cleanup)

describe("Sidebar", () => {
  it("shows the wordmark and a new note action", () => {
    render(<Sidebar />)
    expect(screen.getByText("Tova")).toBeDefined()
    expect(screen.getByLabelText("New note")).toBeDefined()
  })

  it("counts notes per section", () => {
    render(<Sidebar />)
    const notesHeader = screen.getByRole("button", { name: /^Notes/ })
    expect(notesHeader.textContent).toContain("2")

    const trashHeader = screen.getByRole("button", { name: /^Trash/ })
    expect(trashHeader.textContent).toContain("1")
  })

  it("lists loose notes but keeps folder contents collapsed", () => {
    render(<Sidebar />)
    expect(screen.getByText("loose note")).toBeDefined()
    expect(screen.queryByText("project river")).toBeNull()
  })

  it("reveals a folder's notes once expanded", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.click(screen.getByRole("button", { name: /^ideas/ }))
    expect(screen.getByText("project river")).toBeDefined()
  })

  it("aggregates tag counts and excludes trashed notes", () => {
    render(<Sidebar />)
    const work = screen.getByText("work").closest(".tag-row")
    // Two live notes carry #work; the trashed one is not counted.
    expect(work?.textContent).toContain("2")
  })

  it("opens a note when its row is clicked", async () => {
    const user = userEvent.setup()
    bridge.read.mockResolvedValue({ ...notes[1], body: "hello" })
    render(<Sidebar />)

    await user.click(screen.getByRole("button", { name: "loose note" }))
    expect(bridge.read).toHaveBeenCalledWith("notes/loose.md")

    await waitFor(() => expect(useNotesStore.getState().activeId).toBe("notes/loose.md"))
  })

  it("moves a note to trash from its row action", async () => {
    const user = userEvent.setup()
    bridge.remove.mockResolvedValue({ ...notes[1], id: "trash/loose.md", section: "trash" })
    render(<Sidebar />)

    await user.click(screen.getByLabelText("Move loose note to Trash"))
    expect(bridge.remove).toHaveBeenCalledWith("notes/loose.md")
  })

  it("offers restore and permanent delete for trashed notes", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.click(screen.getByRole("button", { name: /^Trash/ }))
    expect(screen.getByLabelText("Restore old draft")).toBeDefined()
    expect(screen.getByLabelText("Permanently delete old draft")).toBeDefined()
  })

  it("offers today's note from the Daily context menu", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^Daily/ })
    })
    expect(screen.getByRole("menuitem", { name: "Open Today's Note" })).toBeDefined()
  })

  it("opens today's note when that menu item is chosen", async () => {
    const user = userEvent.setup()
    bridge.today.mockResolvedValue({ ...notes[2], body: "" })
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^Daily/ })
    })
    await user.click(screen.getByRole("menuitem", { name: "Open Today's Note" }))

    expect(bridge.today).toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Open Today's Note" })).toBeNull()
    )
  })

  it("closes the context menu on Escape", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^Daily/ })
    })
    await user.keyboard("{Escape}")

    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("surfaces a store error", () => {
    useNotesStore.setState({ error: "Vault unreachable" })
    render(<Sidebar />)
    expect(screen.getByText("Vault unreachable")).toBeDefined()
  })
})

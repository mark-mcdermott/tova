import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Sidebar } from "./Sidebar"
import { useNotesStore } from "../../stores/notesStore"
import { NoteSummary } from "../../../shared/types"
import { emptyHistory } from "../../stores/history"

const notes: NoteSummary[] = [
  {
    id: "notes/ideas/river.md",
    title: "Project River",
    section: "notes",
    folder: "ideas",
    tags: ["writing", "work"],
    favorite: false,
    updatedAt: 5,
    deletedAt: null
  },
  {
    id: "notes/loose.md",
    title: "Loose Note",
    section: "notes",
    folder: null,
    tags: ["work"],
    favorite: false,
    updatedAt: 4,
    deletedAt: null
  },
  {
    id: "daily/2026-09-03.md",
    title: "9/3/26",
    section: "daily",
    folder: null,
    tags: [],
    favorite: false,
    updatedAt: 3,
    deletedAt: null
  },
  {
    id: "trash/old.md",
    title: "Old Draft",
    section: "trash",
    folder: null,
    tags: ["work"],
    favorite: false,
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
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  exportMarkdown: vi.fn(),
  setFavorite: vi.fn()
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
    },
    events: { onNotesChanged: vi.fn(() => () => undefined) }
  }
  // Disclosure state lives in the store, so it has to be reset or an expanded
  // folder leaks into whichever test runs next.
  useNotesStore.setState({
    notes,
    folders: ["ideas", "drafts"],
    activeId: null,
    active: null,
    openSeq: 0,
    loading: false,
    error: null,
    history: emptyHistory,
    sidebarCollapsed: false,
    expanded: { folders: true, tags: true, notes: true, daily: true }
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

  it("shows who is signed in at the foot of the sidebar", () => {
    const { container } = render(<Sidebar />)

    expect(screen.getByText("Mark")).toBeDefined()
    expect(container.querySelector(".sidebar-avatar")).not.toBeNull()
  })

  it("no longer offers a collapse control", () => {
    // Parked for now; Cmd+backslash and the reveal tab still drive the state.
    render(<Sidebar />)
    expect(screen.queryByLabelText("Collapse sidebar")).toBeNull()
  })

  it("rules off the tags section from the tree above it", () => {
    const { container } = render(<Sidebar />)
    expect(container.querySelector(".sidebar-rule")).not.toBeNull()
  })

  it("does not open a section that holds nothing", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    // Ideas holds nothing in the fixture; Trash has a note in it.
    const ideas = screen.getByRole("button", { name: /^Ideas/ })
    await user.click(ideas)

    expect(useNotesStore.getState().expanded.ideas).toBeUndefined()
    expect(ideas.getAttribute("aria-disabled")).toBe("true")
  })

  it("still opens a section that holds something", async () => {
    const user = userEvent.setup()
    useNotesStore.setState({ expanded: { tags: true } })
    render(<Sidebar />)

    await user.click(screen.getByRole("button", { name: /^Notes/ }))
    expect(useNotesStore.getState().expanded.notes).toBe(true)
  })

  it("starts with every section but Tags collapsed", () => {
    // The store's own default, not the fixture the other tests set up.
    const { expanded } = useNotesStore.getInitialState()
    expect(expanded.notes).toBeUndefined()
    expect(expanded.daily).toBeUndefined()
    expect(expanded.trash).toBeUndefined()
    expect(expanded.tags).toBe(true)
  })

  it("drops the FOLDERS heading the mockup does not have", () => {
    render(<Sidebar />)
    expect(screen.queryByRole("button", { name: /^FOLDERS/ })).toBeNull()
    // The sections it used to wrap are still there.
    expect(screen.getByRole("button", { name: /^Notes/ })).toBeDefined()
    expect(screen.getByRole("button", { name: /^Daily/ })).toBeDefined()
  })

  it("offers rename and delete on a note", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "loose note" })
    })
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Delete → Trash" })).toBeDefined()
  })

  it("offers recovery actions on a trashed note", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.click(screen.getByRole("button", { name: /^Trash/ }))
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "old draft" })
    })

    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Delete permanently" })).toBeDefined()
    expect(screen.queryByRole("menuitem", { name: "Delete → Trash" })).toBeNull()
  })

  it("renames by opening the note and asking for its title", async () => {
    const user = userEvent.setup()
    bridge.read.mockResolvedValue({ ...notes[1], body: "" })
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "loose note" })
    })
    await user.click(screen.getByRole("menuitem", { name: "Rename" }))

    expect(bridge.read).toHaveBeenCalledWith("notes/loose.md")
    await waitFor(() => expect(useNotesStore.getState().focusTitleSeq).toBe(1))
  })

  it("offers folder actions on a folder", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^ideas/ })
    })

    expect(screen.getByRole("menuitem", { name: "New note" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "New folder" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeDefined()
  })

  it("says how many notes a folder delete will move to Trash", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^ideas/ })
    })
    expect(screen.getByRole("menuitem", { name: "Delete folder (1 → Trash)" })).toBeDefined()
  })

  it("deletes a folder through the store", async () => {
    const user = userEvent.setup()
    bridge.deleteFolder.mockResolvedValue([])
    bridge.list.mockResolvedValue([])
    bridge.listFolders.mockResolvedValue([])
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^ideas/ })
    })
    await user.click(screen.getByRole("menuitem", { name: /^Delete folder/ }))

    expect(bridge.deleteFolder).toHaveBeenCalledWith("ideas")
  })

  it("renames a folder inline", async () => {
    const user = userEvent.setup()
    bridge.renameFolder.mockResolvedValue("thoughts")
    bridge.list.mockResolvedValue([])
    bridge.listFolders.mockResolvedValue([])
    render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^ideas/ })
    })
    await user.click(screen.getByRole("menuitem", { name: "Rename" }))

    const field = screen.getByLabelText("Folder name")
    await user.clear(field)
    await user.type(field, "thoughts{Enter}")

    expect(bridge.renameFolder).toHaveBeenCalledWith("ideas", "thoughts")
  })

  it("offers creation actions on empty sidebar space", async () => {
    const user = userEvent.setup()
    const { container } = render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: container.querySelector(".sidebar-scroll") as Element
    })

    expect(screen.getByRole("menuitem", { name: "New note" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "New folder" })).toBeDefined()
  })

  it("creates a folder from the empty-area menu", async () => {
    const user = userEvent.setup()
    bridge.createFolder.mockResolvedValue("plans")
    bridge.listFolders.mockResolvedValue(["ideas", "drafts", "plans"])
    const { container } = render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: container.querySelector(".sidebar-scroll") as Element
    })
    await user.click(screen.getByRole("menuitem", { name: "New folder" }))

    const field = screen.getByLabelText("Folder name")
    await user.type(field, "plans{Enter}")

    expect(bridge.createFolder).toHaveBeenCalledWith("plans")
  })

  it("abandons folder creation on Escape", async () => {
    const user = userEvent.setup()
    const { container } = render(<Sidebar />)

    await user.pointer({
      keys: "[MouseRight]",
      target: container.querySelector(".sidebar-scroll") as Element
    })
    await user.click(screen.getByRole("menuitem", { name: "New folder" }))
    await user.keyboard("{Escape}")

    expect(screen.queryByLabelText("Folder name")).toBeNull()
    expect(bridge.createFolder).not.toHaveBeenCalled()
  })

  // jsdom does not implement dataTransfer, and useDropTarget deliberately reads
  // the dragged note from the store rather than the payload, so these drive the
  // store directly and fire the drag events by hand.
  function startDragging(id: string) {
    // act, so the drop targets have re-rendered before the drag event lands.
    act(() => {
      useNotesStore.setState({ draggingNoteId: id })
    })
  }

  const transfer = { dropEffect: "", effectAllowed: "", setData: vi.fn(), getData: vi.fn() }

  it("highlights a folder that will accept the note", async () => {
    const user = userEvent.setup()
    render(<Sidebar />)
    startDragging("notes/loose.md")

    const folder = screen.getByRole("button", { name: /^ideas/ })
    fireEvent.dragOver(folder, { dataTransfer: transfer })

    await waitFor(() => expect(folder.className).toContain("is-drop-active"))
    await user.click(folder)
  })

  it("does not highlight the folder the note already lives in", async () => {
    render(<Sidebar />)
    startDragging("notes/ideas/river.md")

    const folder = screen.getByRole("button", { name: /^ideas/ })
    fireEvent.dragOver(folder, { dataTransfer: transfer })

    expect(folder.className).not.toContain("is-drop-active")
  })

  it("moves a note into the folder it is dropped on", async () => {
    bridge.move.mockResolvedValue({ ...notes[1], id: "notes/ideas/loose.md", folder: "ideas" })
    render(<Sidebar />)
    startDragging("notes/loose.md")

    const folder = screen.getByRole("button", { name: /^ideas/ })
    fireEvent.dragOver(folder, { dataTransfer: transfer })
    fireEvent.drop(folder, { dataTransfer: transfer })

    await waitFor(() =>
      expect(bridge.move).toHaveBeenCalledWith("notes/loose.md", {
        section: "notes",
        folder: "ideas"
      })
    )
  })

  it("moves a note out of its folder when dropped on Notes", async () => {
    bridge.move.mockResolvedValue({ ...notes[0], id: "notes/river.md", folder: null })
    render(<Sidebar />)
    startDragging("notes/ideas/river.md")

    const root = screen.getByRole("button", { name: /^Notes/ })
    fireEvent.dragOver(root, { dataTransfer: transfer })
    fireEvent.drop(root, { dataTransfer: transfer })

    await waitFor(() =>
      expect(bridge.move).toHaveBeenCalledWith("notes/ideas/river.md", {
        section: "notes",
        folder: null
      })
    )
  })

  it("refuses a drop on Daily", () => {
    render(<Sidebar />)
    startDragging("notes/loose.md")

    const daily = screen.getByRole("button", { name: /^Daily/ })
    fireEvent.dragOver(daily, { dataTransfer: transfer })
    fireEvent.drop(daily, { dataTransfer: transfer })

    expect(daily.className).not.toContain("is-drop-active")
    expect(bridge.move).not.toHaveBeenCalled()
  })

  it("asks before trashing a dropped note rather than doing it outright", async () => {
    render(<Sidebar />)
    startDragging("notes/loose.md")

    const trashRow = screen.getByRole("button", { name: /^Trash/ })
    fireEvent.dragOver(trashRow, { dataTransfer: transfer })
    fireEvent.drop(trashRow, { dataTransfer: transfer })

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: /Move .* to Trash/ })).toBeDefined()
    )
    expect(bridge.remove).not.toHaveBeenCalled()
  })

  it("trashes once the confirmation is taken", async () => {
    const user = userEvent.setup()
    bridge.remove.mockResolvedValue({ ...notes[1], section: "trash" })
    render(<Sidebar />)
    startDragging("notes/loose.md")

    const trashRow = screen.getByRole("button", { name: /^Trash/ })
    fireEvent.dragOver(trashRow, { dataTransfer: transfer })
    fireEvent.drop(trashRow, { dataTransfer: transfer })

    await user.click(await screen.findByRole("menuitem", { name: /Move .* to Trash/ }))
    expect(bridge.remove).toHaveBeenCalledWith("notes/loose.md")
  })

  it("surfaces a store error", () => {
    useNotesStore.setState({ error: "Vault unreachable" })
    render(<Sidebar />)
    expect(screen.getByText("Vault unreachable")).toBeDefined()
  })
})

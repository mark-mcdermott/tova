import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Sidebar } from "./Sidebar"
import { useNotesStore } from "../../stores/notesStore"
import { NoteSummary } from "../../../shared/types"
import { emptyHistory } from "../../stores/history"
import { stubBridge } from "../../testing/bridge"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { useBlogsStore } from "../../stores/blogsStore"
import { DEFAULT_PREFERENCES } from "../../../shared/preferences"
import { EMPTY_BLOG } from "../../../shared/blogConfig"

const notes: NoteSummary[] = [
  {
    id: "notes/ideas/river.md",
    title: "Project River",
    section: "notes",
    folder: "ideas",
    tags: ["writing", "work"],
    manualTags: [],
    favorite: false,
    updatedAt: 5,
    createdAt: 5,
    deletedAt: null
  },
  {
    id: "notes/loose.md",
    title: "Loose Note",
    section: "notes",
    folder: null,
    tags: ["work"],
    manualTags: [],
    favorite: false,
    updatedAt: 4,
    createdAt: 4,
    deletedAt: null
  },
  {
    id: "daily/2026-09-03.md",
    title: "9/3/26",
    section: "daily",
    folder: null,
    tags: [],
    manualTags: [],
    favorite: false,
    updatedAt: 3,
    createdAt: 3,
    deletedAt: null
  },
  {
    id: "trash/old.md",
    title: "Old Draft",
    section: "trash",
    folder: null,
    tags: ["work"],
    manualTags: [],
    favorite: false,
    updatedAt: 2,
    createdAt: 2,
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
  window.tova = stubBridge({ notes: bridge })
  // Disclosure state lives in the store, so it has to be reset or an expanded
  // folder leaks into whichever test runs next.
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    avatarSources: { system: null, custom: null }
  })
  useBlogsStore.setState({ blogs: [] })
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
    view: "editor",
    expanded: { folders: true, tags: true, notes: true, daily: true }
  })
})

afterEach(cleanup)

describe("Sidebar", () => {
  it("shows the wordmark and a new note action", () => {
    render(<Sidebar />)
    // Drawn rather than set, so it is found by its label, not its text. The
    // button around it carries the name now that the mark is the way home.
    expect(screen.getByRole("button", { name: /^Tova/ })).toBeDefined()
    expect(screen.getByLabelText("New note")).toBeDefined()
  })

  it("goes home from the wordmark, to whichever section is at the top", async () => {
    render(<Sidebar />)
    await userEvent.click(screen.getByRole("button", { name: /^Tova/ }))

    const state = useNotesStore.getState()
    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "section", section: "daily" })
  })

  it("follows the rail when the top section is not the default one", async () => {
    usePreferencesStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        sections: [
          { id: "journal", kind: "section", label: "Journal", icon: "journal", enabled: true },
          { id: "notes", kind: "section", label: "Notes", icon: "notes", enabled: true }
        ]
      }
    })

    render(<Sidebar />)
    expect(screen.getByRole("button", { name: "Tova — open Journal" })).toBeDefined()

    await userEvent.click(screen.getByRole("button", { name: /^Tova/ }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "section", section: "journal" })
  })

  it("marks that section as where you are", async () => {
    render(<Sidebar />)
    await userEvent.click(screen.getByRole("button", { name: /^Tova/ }))

    const row = screen.getByRole("button", { name: /^Daily/ })
    expect(row.className).toContain("is-active")
  })

  it("opens settings from the avatar and from the cog", async () => {
    render(<Sidebar />)

    // The two controls go to different places, so they do not share a name.
    await userEvent.click(screen.getByRole("button", { name: "Profile" }))
    expect(useNotesStore.getState().view).toBe("settings")
    expect(useNotesStore.getState().settingsTab).toBe("profile")

    useNotesStore.setState({ view: "editor" })
    await userEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(useNotesStore.getState().view).toBe("settings")
  })

  it("counts notes per section", () => {
    render(<Sidebar />)
    const notesHeader = screen.getByRole("button", { name: /^Notes/ })
    expect(notesHeader.textContent).toContain("2")

    const trashHeader = screen.getByRole("button", { name: /^Trash/ })
    expect(trashHeader.textContent).toContain("1")
  })

  it("aggregates tag counts and excludes trashed notes", () => {
    render(<Sidebar />)
    const work = screen.getByText("work").closest(".tag-row")
    // Two live notes carry #work; the trashed one is not counted.
    expect(work?.textContent).toContain("2")
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

  it("shows the configured name at the foot of the sidebar", () => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, displayName: "Mark" },
      avatarSources: { system: null, custom: null }
    })
    const { container } = render(<Sidebar />)

    expect(screen.getByText("Mark")).toBeDefined()
    expect(container.querySelector(".sidebar-avatar")).not.toBeNull()
  })

  it("shows the picture alone when no name is set", () => {
    const { container } = render(<Sidebar />)

    expect(container.querySelector(".sidebar-user")).toBeNull()
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

  it("drops the FOLDERS heading the mockup does not have", () => {
    render(<Sidebar />)
    expect(screen.queryByRole("button", { name: /^FOLDERS/ })).toBeNull()
    // The sections it used to wrap are still there.
    expect(screen.getByRole("button", { name: /^Notes/ })).toBeDefined()
    expect(screen.getByRole("button", { name: /^Daily/ })).toBeDefined()
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

  it("opens a section's index instead of unfolding it", async () => {
    render(<Sidebar />)

    await userEvent.click(screen.getByRole("button", { name: /^Notes/ }))

    const state = useNotesStore.getState()
    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "section", section: "notes" })
    // Nothing unfolded: the notes are on the index now, not in the rail.
    expect(screen.queryByText("loose note")).toBeNull()
  })

  it("shows folders as destinations rather than drawers", async () => {
    render(<Sidebar />)

    await userEvent.click(screen.getByRole("button", { name: /^ideas/ }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "folder", folder: "ideas" })
  })

  it("opens a section that holds nothing, so the index can say so", async () => {
    render(<Sidebar />)

    await userEvent.click(screen.getByRole("button", { name: /^Journal/ }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "section", section: "journal" })
  })

  it("opens every tag from the Tags heading", async () => {
    render(<Sidebar />)

    await userEvent.click(screen.getByRole("button", { name: "TAGS" }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "tags" })
  })

  it("opens one tag from its row", async () => {
    render(<Sidebar />)

    await userEvent.click(screen.getByRole("button", { name: /work/ }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "tag", tag: "work" })
  })

  it("keeps the tags list open without being asked", () => {
    useNotesStore.setState({ expanded: {} })
    render(<Sidebar />)

    // Every other section is a destination; this one is the list itself.
    expect(screen.getByText("work")).toBeDefined()
  })

  it("searches from the field above the list", async () => {
    render(<Sidebar />)

    await userEvent.type(screen.getByLabelText("Search notes"), "loose")

    const state = useNotesStore.getState()
    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "search", query: "loose" })
  })

  it("stays put while the field is empty", async () => {
    render(<Sidebar />)
    const field = screen.getByLabelText("Search notes")

    await userEvent.type(field, "a")
    await userEvent.clear(field)

    // Clearing is not a navigation: it leaves the last index showing.
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "search", query: "a" })
  })
})

describe("blogs in the rail", () => {
  const blog = {
    ...EMPTY_BLOG,
    id: "b1",
    name: "markmcdermott.io",
    hasGithubToken: true,
    hasDeployToken: true
  }

  const railLabels = () =>
    screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /^(Notes|Daily|Ideas|Journal|Trash|markmcdermott\.io|Writing)/.test(text))
      .map((text) => text.replace(/\d+$/, ""))

  it("shows a configured blog without it having been arranged first", () => {
    useBlogsStore.setState({ blogs: [blog] })
    render(<Sidebar />)

    expect(railLabels()[0]).toBe("markmcdermott.io")
  })

  it("draws the blog where the rail puts it, not in a block above the sections", () => {
    useBlogsStore.setState({ blogs: [blog] })
    usePreferencesStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        sections: [
          ...DEFAULT_PREFERENCES.sections.slice(0, 2),
          { id: blog.name, kind: "blog", label: "Writing", icon: "posts", enabled: true },
          ...DEFAULT_PREFERENCES.sections.slice(2)
        ]
      }
    })

    render(<Sidebar />)
    expect(railLabels()).toEqual(["Daily", "Notes", "Writing", "Ideas", "Journal", "Trash"])
  })

  it("hides a blog whose row is switched off, and shows the sections around it", () => {
    useBlogsStore.setState({ blogs: [blog] })
    usePreferencesStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        sections: [
          { id: blog.name, kind: "blog", label: "Writing", icon: "posts", enabled: false },
          ...DEFAULT_PREFERENCES.sections
        ]
      }
    })

    render(<Sidebar />)
    expect(railLabels()).toEqual(["Daily", "Notes", "Ideas", "Journal", "Trash"])
  })

  it("opens the blog's index from its row", async () => {
    useBlogsStore.setState({ blogs: [blog] })
    render(<Sidebar />)

    await userEvent.click(screen.getByRole("button", { name: /^markmcdermott\.io/ }))

    const state = useNotesStore.getState()
    expect(state.view).toBe("index")
    expect(state.indexTarget).toEqual({ kind: "blog", blog: "markmcdermott.io" })
  })
})

describe("what moves when the rail is scrolled", () => {
  it("keeps the sections out of the part that scrolls", () => {
    // Scrolling to a tag used to carry the folders away with it, so finding a
    // tag lost sight of where else you could go.
    render(<Sidebar />)

    const scroller = document.querySelector(".sidebar-scroll")
    const places = document.querySelector(".sidebar-places")

    expect(places?.querySelector(".disclosure")).not.toBeNull()
    expect(scroller?.textContent).not.toContain("Notes")
  })

  it("puts the tags in it", () => {
    render(<Sidebar />)
    expect(document.querySelector(".sidebar-scroll")?.textContent).toContain("TAGS")
  })

  it("leaves the header, the search and the footer outside it entirely", () => {
    render(<Sidebar />)
    const scroller = document.querySelector(".sidebar-scroll")

    for (const fixed of [".sidebar-header", ".sidebar-search", ".sidebar-footer"]) {
      expect(document.querySelector(fixed)).not.toBeNull()
      expect(scroller?.querySelector(fixed)).toBeNull()
    }
  })
})

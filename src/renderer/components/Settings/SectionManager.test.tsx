import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SectionManager } from "./SectionManager"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { useNotesStore } from "../../stores/notesStore"
import { DEFAULT_PREFERENCES } from "../../../shared/preferences"
import { stubBridge } from "../../testing/bridge"

const write = vi.fn()
const createSection = vi.fn()
const deleteSection = vi.fn().mockResolvedValue([])
const list = vi.fn().mockResolvedValue([])

beforeEach(() => {
  vi.clearAllMocks()
  write.mockImplementation(async (value: unknown) => value)
  window.tova = stubBridge({
    preferences: { write },
    notes: { createSection, deleteSection, list }
  })
  usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES }, avatarUrl: null })
  useNotesStore.setState({ notes: [] })
})

afterEach(cleanup)

/** The sections as they were last written to disk. */
function saved() {
  return write.mock.calls.at(-1)?.[0].sections.map((s: { id: string }) => s.id)
}

describe("SectionManager", () => {
  it("lists every section, Daily and Trash included", () => {
    render(<SectionManager />)
    expect(screen.getAllByRole("textbox").length).toBe(6) // five sections plus the add field
  })

  it("lets Daily be renamed, re-iconed, hidden and moved — everything but removed", () => {
    render(<SectionManager />)

    expect((screen.getByLabelText("Name of Daily") as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText("Icon for Daily") as HTMLSelectElement).disabled).toBe(false)
    expect((screen.getByLabelText("Show Daily") as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText("Move Daily up") as HTMLButtonElement).disabled).toBe(false)
    // The one thing it cannot do: its notes are made for you, one a day.
    expect((screen.getByLabelText("Remove Daily") as HTMLButtonElement).disabled).toBe(true)
  })

  it("does the same for Trash", () => {
    render(<SectionManager />)

    expect((screen.getByLabelText("Name of Trash") as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText("Show Trash") as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText("Remove Trash") as HTMLButtonElement).disabled).toBe(true)
  })

  it("says what the two kept sections are for, so a rename does not hide it", () => {
    render(<SectionManager />)

    expect(screen.getByText("today's note, made for you")).toBeDefined()
    expect(screen.getByText("where deleted notes go")).toBeDefined()
  })

  it("renames without touching the vault", async () => {
    render(<SectionManager />)
    await userEvent.type(screen.getByLabelText("Name of Ideas"), "!")

    await waitFor(() => expect(write).toHaveBeenCalled())
    // The id is the directory. If a rename moved files, this would change.
    expect(saved()).toEqual(["notes", "daily", "ideas", "journal", "trash"])
    expect(createSection).not.toHaveBeenCalled()
    expect(deleteSection).not.toHaveBeenCalled()
  })

  it("reorders a section", async () => {
    render(<SectionManager />)
    await userEvent.click(screen.getByLabelText("Move Journal up"))

    await waitFor(() => expect(saved()).toEqual(["notes", "daily", "journal", "ideas", "trash"]))
  })

  it("moves a section past Daily rather than stopping at it", async () => {
    render(<SectionManager />)
    await userEvent.click(screen.getByLabelText("Move Ideas up"))

    // Daily used to be a wall; Ideas now passes it.
    await waitFor(() => expect(saved()).toEqual(["notes", "ideas", "daily", "journal", "trash"]))
  })

  it("hides a section without removing it", async () => {
    render(<SectionManager />)
    await userEvent.click(screen.getByLabelText("Show Journal"))

    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(saved()).toContain("journal")
    expect(deleteSection).not.toHaveBeenCalled()
  })

  it("adds a section, making its directory first", async () => {
    render(<SectionManager />)
    await userEvent.type(screen.getByLabelText("New section name"), "Reading List")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(createSection).toHaveBeenCalledWith("reading-list"))
    expect(saved()).toEqual(["notes", "daily", "ideas", "journal", "reading-list", "trash"])
  })

  it("says why a name was refused rather than doing nothing", async () => {
    render(<SectionManager />)
    await userEvent.type(screen.getByLabelText("New section name"), "Ideas")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(screen.getByText(/already taken/)).toBeDefined()
    expect(createSection).not.toHaveBeenCalled()
  })

  it("warns what a removal will do to the notes inside it", async () => {
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal("confirm", confirm)
    useNotesStore.setState({
      notes: [
        {
          id: "ideas/a.md",
          title: "A",
          section: "ideas",
          folder: null,
          tags: [],
          favorite: false,
          updatedAt: 0,
          createdAt: 0,
          deletedAt: null
        }
      ]
    })

    render(<SectionManager />)
    await userEvent.click(screen.getByLabelText("Remove Ideas"))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 note goes to Trash"))
    expect(deleteSection).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("removes once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    render(<SectionManager />)

    await userEvent.click(screen.getByLabelText("Remove Ideas"))
    await waitFor(() => expect(deleteSection).toHaveBeenCalledWith("ideas"))
    expect(saved()).not.toContain("ideas")
    vi.unstubAllGlobals()
  })
})

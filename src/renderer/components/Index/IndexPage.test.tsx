import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { IndexPage } from "./IndexPage"
import { useNotesStore } from "../../stores/notesStore"
import { NoteSummary } from "../../../shared/types"
import { emptyHistory } from "../../stores/history"
import { stubBridge } from "../../testing/bridge"

function note(partial: Partial<NoteSummary> & { title: string }): NoteSummary {
  return {
    id: `notes/${partial.title}.md`,
    section: "notes",
    folder: null,
    tags: [],
    favorite: false,
    updatedAt: 0,
    createdAt: 0,
    deletedAt: null,
    ...partial
  }
}

const notes = [
  note({ title: "Beta", updatedAt: 3, createdAt: 1 }),
  note({ title: "Alpha", updatedAt: 1, createdAt: 3, favorite: true }),
  note({ title: "Gamma", updatedAt: 2, createdAt: 2, tags: ["writing"] })
]

const read = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge({ notes: { read } })
  useNotesStore.setState({
    notes,
    folders: [],
    activeId: null,
    active: null,
    loading: false,
    error: null,
    history: emptyHistory,
    view: "index",
    indexSort: "updated",
    indexTarget: { kind: "section", section: "notes" }
  })
})

afterEach(cleanup)

describe("IndexPage", () => {
  it("names the place it is listing", () => {
    render(<IndexPage />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Notes")
  })

  it("floats favourites to the top", () => {
    const { container } = render(<IndexPage />)
    const titles = [...container.querySelectorAll(".index-row-title")].map((t) => t.textContent)

    // Alpha is the oldest edit, so only the favourite mark puts it first.
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"])
  })

  it("marks a favourite so it reads as on", () => {
    render(<IndexPage />)
    expect(screen.getByRole("button", { name: "Unfavourite Alpha" }).className).toContain("is-on")
  })

  it("reorders when the sort changes", async () => {
    render(<IndexPage />)
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "title")

    expect(useNotesStore.getState().indexSort).toBe("title")
  })

  it("says so rather than showing an empty list", () => {
    useNotesStore.setState({ indexTarget: { kind: "section", section: "journal" } })
    render(<IndexPage />)
    expect(screen.getByText("Nothing here yet.")).toBeDefined()
  })

  it("lists every tag with its count", () => {
    useNotesStore.setState({ indexTarget: { kind: "tags" } })
    render(<IndexPage />)

    expect(screen.getByText("#writing")).toBeDefined()
    expect(screen.getByText("1 note")).toBeDefined()
  })

  it("opens one tag from the list of all of them", async () => {
    useNotesStore.setState({ indexTarget: { kind: "tags" } })
    render(<IndexPage />)

    await userEvent.click(screen.getByRole("button", { name: /#writing/ }))
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "tag", tag: "writing" })
  })

  it("offers a way back up from a tag, but not from a section", async () => {
    useNotesStore.setState({ indexTarget: { kind: "tag", tag: "writing" } })
    const { rerender } = render(<IndexPage />)
    expect(screen.getByRole("button", { name: "Tags" })).toBeDefined()

    useNotesStore.setState({ indexTarget: { kind: "section", section: "notes" } })
    rerender(<IndexPage />)
    expect(screen.queryByRole("button", { name: "Tags" })).toBeNull()
  })

  it("hides the sort on the tag list, which sorts itself by use", () => {
    useNotesStore.setState({ indexTarget: { kind: "tags" } })
    render(<IndexPage />)
    expect(screen.queryByLabelText("Sort by")).toBeNull()
  })
})

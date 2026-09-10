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

  it("draws no trail on a section, where it would only repeat the heading", () => {
    // "Ideas" sat above "Ideas". The heading stays; the crumb goes.
    useNotesStore.setState({ indexTarget: { kind: "section", section: "ideas" } })
    render(<IndexPage />)

    expect(screen.getByRole("heading", { name: "Ideas" })).toBeDefined()
    expect(document.querySelector(".breadcrumb")).toBeNull()
  })

  it("keeps the trail where it says something the heading does not", () => {
    // A folder names its parent; a tag names where tags live.
    useNotesStore.setState({ indexTarget: { kind: "folder", folder: "ideas" } })
    const { rerender } = render(<IndexPage />)
    expect(document.querySelector(".breadcrumb")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Notes" })).toBeDefined()

    useNotesStore.setState({ indexTarget: { kind: "tag", tag: "writing" } })
    rerender(<IndexPage />)
    expect(document.querySelector(".breadcrumb")).not.toBeNull()
  })

  it("keeps the sort control on its right edge once the trail is gone", () => {
    useNotesStore.setState({ indexTarget: { kind: "section", section: "ideas" } })
    render(<IndexPage />)

    // margin-left: auto does the work, so the control must still be the last
    // thing in the nav rather than sliding left into the vacated space.
    const nav = document.querySelector(".editor-nav")
    expect(nav?.lastElementChild?.className).toContain("editor-nav-end")
  })

  it("hides the sort on the tag list, which sorts itself by use", () => {
    useNotesStore.setState({ indexTarget: { kind: "tags" } })
    render(<IndexPage />)
    expect(screen.queryByLabelText("Sort by")).toBeNull()
  })

  it("shows what main found rather than filtering what it already holds", () => {
    useNotesStore.setState({
      indexTarget: { kind: "search", query: "quiet" },
      searchHits: [
        { note: notes[2], match: { where: "body", snippet: "…a kind of quiet…", score: 10 } }
      ]
    })
    render(<IndexPage />)

    // Gamma has no "quiet" in its title or tags — only main can know it matched.
    expect(screen.getByText("Gamma")).toBeDefined()
    expect(screen.getByText("…a kind of quiet…")).toBeDefined()
  })

  it("shows no snippet for a title hit, which needs no explaining", () => {
    useNotesStore.setState({
      indexTarget: { kind: "search", query: "gamma" },
      searchHits: [
        { note: notes[2], match: { where: "title", snippet: "some body text", score: 45 } }
      ]
    })
    const { container } = render(<IndexPage />)

    expect(container.querySelector(".index-row-snippet")).toBeNull()
  })

  it("says it is searching rather than that nothing matched", () => {
    useNotesStore.setState({
      indexTarget: { kind: "search", query: "quiet" },
      searchHits: [],
      searching: true
    })
    render(<IndexPage />)

    expect(screen.getByText("Searching…")).toBeDefined()
  })

  it("says nothing matched once it has finished looking", () => {
    useNotesStore.setState({
      indexTarget: { kind: "search", query: "zzz" },
      searchHits: [],
      searching: false
    })
    render(<IndexPage />)

    expect(screen.getByText("Nothing matches that.")).toBeDefined()
  })

  it("offers relevance on search, and starts there", () => {
    useNotesStore.setState({ indexTarget: { kind: "search", query: "a" }, searchSort: "relevance" })
    render(<IndexPage />)

    const sort = screen.getByLabelText("Sort by") as HTMLSelectElement
    expect(sort.value).toBe("relevance")
    expect([...sort.options].map((o) => o.value)).toEqual([
      "relevance",
      "updated",
      "created",
      "title"
    ])
  })

  it("leaves the ranking alone while relevance is chosen", () => {
    useNotesStore.setState({
      indexTarget: { kind: "search", query: "a" },
      searchSort: "relevance",
      searchHits: [
        { note: notes[1], match: { where: "body", snippet: null, score: 4 } },
        { note: notes[0], match: { where: "title", snippet: null, score: 60 } }
      ]
    })
    const { container } = render(<IndexPage />)

    // Main ranked these; the page must not re-sort them into its own order.
    expect([...container.querySelectorAll(".index-row-title")].map((t) => t.textContent)).toEqual([
      "Alpha",
      "Beta"
    ])
  })

  it("re-sorts the results when another order is chosen", () => {
    useNotesStore.setState({
      indexTarget: { kind: "search", query: "a" },
      searchSort: "title",
      searchHits: [
        { note: notes[0], match: { where: "title", snippet: null, score: 60 } },
        { note: notes[1], match: { where: "body", snippet: null, score: 4 } }
      ]
    })
    const { container } = render(<IndexPage />)

    expect([...container.querySelectorAll(".index-row-title")].map((t) => t.textContent)).toEqual([
      "Alpha",
      "Beta"
    ])
  })

  it("keeps the search sort clear of the one the other indexes use", async () => {
    useNotesStore.setState({ indexTarget: { kind: "search", query: "a" }, indexSort: "updated" })
    render(<IndexPage />)

    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "title")

    expect(useNotesStore.getState().searchSort).toBe("title")
    expect(useNotesStore.getState().indexSort).toBe("updated")
  })
})

describe("deleting from a row asks first", () => {
  it("does not trash on the click alone", async () => {
    const remove = vi.fn(async () => notes[0])
    window.tova = stubBridge({ notes: { read, remove } })
    render(<IndexPage />)

    await userEvent.click(screen.getByRole("button", { name: /Move Beta to Trash/ }))

    // The row's trash now shows on any hover of the row, so it is much easier
    // to hit by accident than it was.
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog")).toBeDefined()
  })

  it("trashes once confirmed", async () => {
    const remove = vi.fn(async () => notes[0])
    window.tova = stubBridge({ notes: { read, remove } })
    render(<IndexPage />)

    await userEvent.click(screen.getByRole("button", { name: /Move Beta to Trash/ }))
    await userEvent.click(screen.getByRole("button", { name: "Move to Trash" }))

    expect(remove).toHaveBeenCalledWith(notes[0].id)
  })

  it("leaves the note alone when the dialog is dismissed", async () => {
    const remove = vi.fn(async () => notes[0])
    window.tova = stubBridge({ notes: { read, remove } })
    render(<IndexPage />)

    await userEvent.click(screen.getByRole("button", { name: /Move Beta to Trash/ }))
    await userEvent.keyboard("{Escape}")

    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("names the note in the question, so the wrong row is obvious", async () => {
    window.tova = stubBridge({ notes: { read } })
    render(<IndexPage />)

    await userEvent.click(screen.getByRole("button", { name: /Move Gamma to Trash/ }))
    expect(screen.getByRole("alertdialog", { name: /Gamma/ })).toBeDefined()
  })
})

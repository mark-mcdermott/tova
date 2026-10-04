import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TabBar } from "./TabBar"
import { useNotesStore } from "../../stores/notesStore"
import { emptyHistory } from "../../stores/history"
import { stubBridge } from "../../testing/bridge"

const today = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  today.mockResolvedValue({
    id: "daily/2026-10-04.md",
    title: "10/4/26",
    section: "daily",
    folder: null,
    tags: [],
    updatedAt: 1,
    createdAt: 1,
    deletedAt: null,
    favorite: false,
    body: ""
  })

  window.tova = stubBridge({ notes: { today } })
  useNotesStore.setState({
    view: "editor",
    activeId: null,
    active: null,
    indexTarget: null,
    history: emptyHistory,
    error: null
  })
})

afterEach(cleanup)

const tab = (name: string) => screen.getByRole("button", { name })
const current = () =>
  screen
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-current") === "page")
    .map((button) => button.textContent)

describe("the three places a phone goes", () => {
  it("offers them in the order the mocks have them", () => {
    render(<TabBar />)

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Notes",
      "Daily",
      "Settings"
    ])
  })

  it("opens everything you could still read, not one section of it", async () => {
    render(<TabBar />)
    await userEvent.click(tab("Notes"))

    expect(useNotesStore.getState().view).toBe("index")
    expect(useNotesStore.getState().indexTarget).toEqual({ kind: "recent" })
  })

  it("opens today's writing, making it if the day is new", async () => {
    render(<TabBar />)
    await userEvent.click(tab("Daily"))

    await waitFor(() => expect(today).toHaveBeenCalled())
    await waitFor(() => expect(useNotesStore.getState().activeId).toBe("daily/2026-10-04.md"))
  })

  it("opens settings where they were left", async () => {
    useNotesStore.setState({ settingsTab: "vault" })
    render(<TabBar />)
    await userEvent.click(tab("Settings"))

    expect(useNotesStore.getState().view).toBe("settings")
    expect(useNotesStore.getState().settingsTab).toBe("vault")
  })
})

/*
 * A row of destinations that never says which one you are on is a row of
 * buttons. `aria-current` is the claim; the highlight is drawn from it.
 */
describe("which one you are on", () => {
  it("is Notes on the listing, and not on another one", () => {
    useNotesStore.setState({ view: "index", indexTarget: { kind: "recent" } })
    const { rerender } = render(<TabBar />)
    expect(current()).toEqual(["Notes"])

    useNotesStore.setState({ indexTarget: { kind: "section", section: "ideas" } })
    rerender(<TabBar />)
    expect(current()).toEqual([])
  })

  it("is Daily in a daily note, and not in any other note", () => {
    useNotesStore.setState({ view: "editor", active: { section: "daily" } as never })
    const { rerender } = render(<TabBar />)
    expect(current()).toEqual(["Daily"])

    useNotesStore.setState({ active: { section: "notes" } as never })
    rerender(<TabBar />)
    expect(current()).toEqual([])
  })

  it("is Settings in settings", () => {
    useNotesStore.setState({ view: "settings" })
    render(<TabBar />)
    expect(current()).toEqual(["Settings"])
  })

  it("is never two at once", () => {
    useNotesStore.setState({
      view: "settings",
      indexTarget: { kind: "recent" },
      active: { section: "daily" } as never
    })
    render(<TabBar />)

    expect(current()).toEqual(["Settings"])
  })
})

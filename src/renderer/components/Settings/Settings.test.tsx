import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Settings } from "./Settings"
import { useNotesStore } from "../../stores/notesStore"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { emptyHistory } from "../../stores/history"
import { stubBridge } from "../../testing/bridge"
import { DEFAULT_PREFERENCES } from "../../../shared/preferences"

const read = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  read.mockResolvedValue({
    id: "daily/2026-09-07.md",
    title: "9/7/26",
    section: "daily",
    folder: null,
    tags: [],
    updatedAt: 1,
    deletedAt: null,
    favorite: false,
    body: ""
  })

  window.tova = stubBridge({ notes: { read } })
  usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES }, avatarUrl: null })
  useNotesStore.setState({
    view: "settings",
    settingsTab: "profile",
    activeId: "daily/2026-09-07.md",
    active: null,
    history: emptyHistory,
    error: null
  })
})

afterEach(cleanup)

describe("Settings", () => {
  it("opens on the tab it was asked for", () => {
    useNotesStore.setState({ settingsTab: "general" })
    render(<Settings />)

    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByLabelText("Font size")).toBeDefined()
  })

  it("shows every section as a tab", () => {
    render(<Settings />)
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Profile",
      "Appearance",
      "Vault",
      "Blogs",
      "General",
      "Docs"
    ])
  })

  it("switches panel when a tab is chosen", async () => {
    render(<Settings />)
    expect(screen.getByLabelText("Display name")).toBeDefined()

    await userEvent.click(screen.getByRole("tab", { name: "Docs" }))
    expect(screen.getByLabelText("Search the docs")).toBeDefined()
    expect(screen.queryByLabelText("Display name")).toBeNull()
  })

  it("names the tab it is showing", async () => {
    render(<Settings />)
    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }))
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Appearance")
  })

  it("returns to the note that was open", async () => {
    render(<Settings />)
    await userEvent.click(screen.getByLabelText("Back to writing"))

    await waitFor(() => expect(read).toHaveBeenCalledWith("daily/2026-09-07.md"))
    await waitFor(() => expect(useNotesStore.getState().view).toBe("editor"))
  })
})

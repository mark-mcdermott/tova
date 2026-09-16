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
    createdAt: 1,
    deletedAt: null,
    favorite: false,
    body: ""
  })

  window.tova = stubBridge({ notes: { read } })
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    avatarSources: { system: null, custom: null }
  })
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
    // Font size moved to Appearance, where the rest of the type lives.
    expect(screen.getByLabelText("Check spelling")).toBeDefined()
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
    expect(screen.getByText("Display name")).toBeDefined()

    await userEvent.click(screen.getByRole("tab", { name: "Docs" }))
    expect(screen.getByLabelText("Search the docs")).toBeDefined()
    expect(screen.queryByText("Display name")).toBeNull()
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

/*
 * Going off to read something and coming back to Settings should land where
 * you were. Reaching for the cog is how you return to what you were doing, and
 * being dropped on Profile every time means navigating back to it every time.
 */
describe("the tab you were last on", () => {
  it("is where the cog puts you", async () => {
    useNotesStore.setState({ settingsTab: "profile" })
    const { showSettings, open } = useNotesStore.getState()

    showSettings("appearance")
    expect(useNotesStore.getState().settingsTab).toBe("appearance")

    // Off to a note and back again, the way the sidebar takes you.
    await open("daily/2026-09-07.md")
    expect(useNotesStore.getState().view).toBe("editor")

    showSettings()

    expect(useNotesStore.getState().view).toBe("settings")
    expect(useNotesStore.getState().settingsTab).toBe("appearance")
  })

  /* The Profile control is not the cog: it names a tab and should go there. */
  it("is overridden by a control that names one", () => {
    useNotesStore.setState({ settingsTab: "vault" })

    useNotesStore.getState().showSettings("profile")

    expect(useNotesStore.getState().settingsTab).toBe("profile")
  })

  /* It is where you were, not a preference — a fresh launch starts over. */
  it("starts on Profile in a fresh store", () => {
    expect(useNotesStore.getInitialState().settingsTab).toBe("profile")
  })
})

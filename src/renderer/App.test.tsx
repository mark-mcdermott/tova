import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "./App"
import { useNotesStore } from "./stores/notesStore"
import { usePreferencesStore } from "./stores/preferencesStore"
import { emptyHistory } from "./stores/history"
import { stubBridge } from "./testing/bridge"
import { DEFAULT_PREFERENCES } from "../shared/preferences"

const openNote = {
  id: "notes/river.md",
  title: "River",
  section: "notes" as const,
  folder: null,
  tags: [],
  manualTags: [],
  favorite: false,
  updatedAt: 1,
  createdAt: 1,
  deletedAt: null,
  body: ""
}

function viewport(phone: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: phone,
    addEventListener: () => {},
    removeEventListener: () => {}
  }) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge()
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, greeted: true },
    loaded: true,
    avatarSources: { system: null, custom: null }
  })
  useNotesStore.setState({
    view: "editor",
    activeId: null,
    active: null,
    history: emptyHistory,
    sidebarCollapsed: false,
    error: null
  })
})

afterEach(cleanup)

const sidebar = () => screen.queryByLabelText("Close sidebar")
const reveal = () => screen.queryByLabelText("Show sidebar")

/*
 * The sidebar is 17.25rem of a 24rem screen, so on a phone it is not a column
 * beside the writing — it is a thing standing in front of it. Everything here
 * is about it not being left there.
 */
describe("the sidebar on a phone", () => {
  it("is not standing over the writing at launch", async () => {
    viewport(true)
    render(<App />)

    await waitFor(() => expect(useNotesStore.getState().sidebarCollapsed).toBe(true))
    expect(reveal()).not.toBeNull()
  })

  it("is put away by picking something out of it", async () => {
    viewport(true)
    render(<App />)
    await waitFor(() => expect(useNotesStore.getState().sidebarCollapsed).toBe(true))

    useNotesStore.setState({ sidebarCollapsed: false })
    await waitFor(() => expect(sidebar()).not.toBeNull())

    // Any way of arriving somewhere, not any particular tap.
    useNotesStore.setState({ activeId: "notes/river.md" })

    await waitFor(() => expect(useNotesStore.getState().sidebarCollapsed).toBe(true))
  })

  it("is put away by tapping the writing behind it", async () => {
    viewport(true)
    render(<App />)
    useNotesStore.setState({ sidebarCollapsed: false })

    const scrim = await waitFor(() => {
      const found = sidebar()
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    await userEvent.click(scrim)

    expect(useNotesStore.getState().sidebarCollapsed).toBe(true)
  })
})

/*
 * The mocks give the editor the formatting controls and the keyboard where
 * this row would be. Two bars at the foot of a 24rem screen is most of the
 * writing gone, so the one screen that is a piece of work keeps its own.
 */
describe("the tab bar", () => {
  const bar = () => screen.queryByRole("navigation", { name: "Main" })

  it("is there on a phone, anywhere but inside a note", async () => {
    viewport(true)
    useNotesStore.setState({ view: "settings" })
    render(<App />)

    await waitFor(() => expect(bar()).not.toBeNull())
  })

  it("is not there with a note open", async () => {
    viewport(true)
    // Both, because a launch with neither goes looking for somewhere to be
    // and would open today's note over this one.
    useNotesStore.setState({ view: "editor", activeId: openNote.id, active: openNote })
    render(<App />)

    await waitFor(() => expect(useNotesStore.getState().sidebarCollapsed).toBe(true))
    expect(bar()).toBeNull()
  })

  /*
   * The empty editor is not a piece of work: there is no note and no
   * formatting toolbar under it, so taking the row away would leave a phone
   * with nothing to tap at all.
   */
  it("is there when the editor has nothing open", async () => {
    viewport(true)
    useNotesStore.setState({ view: "editor", active: null })
    render(<App />)

    await waitFor(() => expect(bar()).not.toBeNull())
  })

  it("is never there on a desktop, where the sidebar is the navigation", async () => {
    viewport(false)
    useNotesStore.setState({ view: "settings" })
    render(<App />)

    await waitFor(() => expect(screen.queryByLabelText("Search notes")).not.toBeNull())
    expect(bar()).toBeNull()
  })
})

describe("the sidebar on a desktop", () => {
  it("is a column, and stays open", async () => {
    viewport(false)
    render(<App />)

    // The sidebar itself is on screen, not the control that brings it back.
    await waitFor(() => expect(screen.queryByLabelText("Search notes")).not.toBeNull())
    expect(reveal()).toBeNull()
    expect(useNotesStore.getState().sidebarCollapsed).toBe(false)

    useNotesStore.setState({ activeId: "notes/river.md" })

    await waitFor(() => expect(useNotesStore.getState().activeId).toBe("notes/river.md"))
    expect(useNotesStore.getState().sidebarCollapsed).toBe(false)
  })

  // Nothing to tap the writing with, because nothing is covering it.
  it("has no scrim", async () => {
    viewport(false)
    render(<App />)

    await waitFor(() => expect(useNotesStore.getState().sidebarCollapsed).toBe(false))
    expect(sidebar()).toBeNull()
  })
})

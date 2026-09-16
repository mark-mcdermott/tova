import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GeneralTab } from "./GeneralTab"

/** What the stub bridge answers `app.info()` with. */
const APP_INFO = { version: "1.0.0", tauri: "2.11.5", webview: "605.1.15" }
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { stubBridge } from "../../../testing/bridge"
import { DEFAULT_PREFERENCES } from "../../../../shared/preferences"

const reset = vi.fn()
const nuke = vi.fn()
const nukeTargets = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  nukeTargets.mockResolvedValue(["/Users/someone/Documents/Tova", "/Users/someone/Library/tova"])
  window.tova = stubBridge({ preferences: { reset, nuke, nukeTargets } })
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    load: vi.fn(async () => undefined)
  })
})

afterEach(cleanup)

describe("starting over", () => {
  it("asks before it resets anything", async () => {
    render(<GeneralTab />)
    await userEvent.click(screen.getByRole("button", { name: "Reset all settings to defaults" }))

    expect(screen.getByRole("alertdialog")).toBeDefined()
    expect(reset).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Reset" }))
    await waitFor(() => expect(reset).toHaveBeenCalled())
  })

  it("does nothing at all when the reset is waved off", async () => {
    render(<GeneralTab />)
    await userEvent.click(screen.getByRole("button", { name: "Reset all settings to defaults" }))
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(reset).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("names the folders a nuke would take before asking", async () => {
    // The reader is being asked to agree to losing these, so they are named.
    render(<GeneralTab />)
    await userEvent.click(screen.getByRole("button", { name: "Nuke all settings, data and notes" }))

    await waitFor(() => expect(screen.getByText("/Users/someone/Documents/Tova")).toBeDefined())
    expect(screen.getByText("/Users/someone/Library/tova")).toBeDefined()
  })

  it("will not nuke until the word is typed", async () => {
    render(<GeneralTab />)
    await userEvent.click(screen.getByRole("button", { name: "Nuke all settings, data and notes" }))
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeDefined())

    const confirm = screen.getByRole("button", { name: "Delete everything" })
    await userEvent.click(confirm)
    expect(nuke).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText("Type confirm to confirm"), "confirm")
    await userEvent.click(confirm)
    await waitFor(() => expect(nuke).toHaveBeenCalled())
  })
})

/*
 * The only thing Tova sends anywhere on its own. Off has to mean off, and the
 * switch has to be findable — a preference nobody can locate is not a choice.
 */
describe("checking for updates", () => {
  it("is on to begin with, and says so", async () => {
    render(<GeneralTab />)

    const box = await screen.findByLabelText("Check for updates")
    expect((box as HTMLInputElement).checked).toBe(true)
  })

  it("can be turned off", async () => {
    const write = vi.fn(async (next) => next)
    window.tova = stubBridge({ preferences: { write } })

    render(<GeneralTab />)
    await userEvent.click(await screen.findByLabelText("Check for updates"))

    expect(write).toHaveBeenCalledWith(expect.objectContaining({ updates: false }))
  })
})

/*
 * Grammar's dictionary is 15MB and is not in the download, so the switch has
 * work to do behind it. The cases that matter are the ones where that work
 * does not go to plan: a switch reading On while nothing is ever underlined is
 * the failure this has to avoid.
 */
describe("turning grammar on", () => {
  const status = vi.fn()
  const fetchDictionary = vi.fn()
  const update = vi.fn(async () => undefined)

  beforeEach(() => {
    status.mockResolvedValue({ ready: false, bytes: 15_634_488, version: "2.7.0" })
    fetchDictionary.mockResolvedValue({ ready: true, bytes: 15_634_488, version: "2.7.0" })
    window.tova = stubBridge({
      preferences: { reset, nuke, nukeTargets },
      grammar: { status, fetch: fetchDictionary }
    })
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES },
      load: vi.fn(async () => undefined),
      update
    })
  })

  it("fetches the dictionary when it is not already here", async () => {
    render(<GeneralTab />)
    await waitFor(() => expect(status).toHaveBeenCalled())

    await userEvent.click(screen.getByLabelText("Check grammar"))

    await waitFor(() => expect(fetchDictionary).toHaveBeenCalled())
    expect(update).toHaveBeenCalledWith({ grammar: true })
  })

  it("does not fetch it twice when it is already here", async () => {
    status.mockResolvedValue({ ready: true, bytes: 15_634_488, version: "2.7.0" })
    render(<GeneralTab />)
    await waitFor(() => expect(status).toHaveBeenCalled())

    await userEvent.click(screen.getByLabelText("Check grammar"))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ grammar: true }))
    expect(fetchDictionary).not.toHaveBeenCalled()
  })

  it("says what it is waiting for rather than sitting there", async () => {
    let finish: (value: unknown) => void = () => undefined
    fetchDictionary.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    render(<GeneralTab />)
    await waitFor(() => expect(status).toHaveBeenCalled())
    await userEvent.click(screen.getByLabelText("Check grammar"))

    await waitFor(() => expect(screen.getByText("Fetching…")).toBeTruthy())
    expect(screen.getByLabelText("Check grammar")).toHaveProperty("disabled", true)

    finish({ ready: true, bytes: 15_634_488, version: "2.7.0" })
  })

  /*
   * The one that matters. A download that fails leaves the preference off,
   * because a reader who is told grammar is on and never sees an underline has
   * no way to find out which of the two is lying.
   */
  it("turns itself back off when the dictionary cannot be fetched", async () => {
    fetchDictionary.mockRejectedValue(new Error("offline"))

    render(<GeneralTab />)
    await waitFor(() => expect(status).toHaveBeenCalled())
    await userEvent.click(screen.getByLabelText("Check grammar"))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ grammar: false }))
    expect(screen.getByText(/could not be fetched/)).toBeTruthy()
  })

  it("never asks for it at all when grammar is switched off", async () => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, grammar: true },
      load: vi.fn(async () => undefined),
      update
    })
    render(<GeneralTab />)
    await waitFor(() => expect(status).toHaveBeenCalled())

    await userEvent.click(screen.getByLabelText("Check grammar"))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ grammar: false }))
    expect(fetchDictionary).not.toHaveBeenCalled()
  })
})

/*
 * About moved here from the Vault tab. It is about the app rather than about a
 * vault, and it sits at the bottom of the first tab somebody opens.
 */
describe("About", () => {
  /*
   * The About panel named Electron and Chromium, which is what used to be
   * drawing this. One of those rows went blank at the cutover and the other
   * was labelling a WebKit version.
   */
  it("names what is actually running the app", async () => {
    render(<GeneralTab />)

    for (const [label, value] of [
      ["Tova", APP_INFO.version],
      ["Tauri", APP_INFO.tauri],
      ["WebKit", APP_INFO.webview]
    ]) {
      const term = await screen.findByText(label)
      expect(term.nextElementSibling?.textContent, `${label} row`).toBe(value)
    }
  })
})

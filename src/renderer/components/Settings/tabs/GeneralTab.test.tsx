import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GeneralTab } from "./GeneralTab"
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

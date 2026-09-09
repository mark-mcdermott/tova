import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AppearanceTab } from "./AppearanceTab"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { stubBridge } from "../../../testing/bridge"
import { DEFAULT_PREFERENCES } from "../../../../shared/preferences"

const write = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  write.mockImplementation(async (value: unknown) => value)
  window.tova = stubBridge({ preferences: { write } })
  usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES }, avatarUrl: null })
})

afterEach(cleanup)

describe("AppearanceTab", () => {
  it("offers both bundled title faces", () => {
    render(<AppearanceTab />)
    expect(screen.getByText("Alagambe")).toBeDefined()
    expect(screen.getByText("Fascinate Inline")).toBeDefined()
  })

  it("marks the one in use", () => {
    render(<AppearanceTab />)
    const [alagambe, fascinate] = screen.getAllByRole("button", { name: /Tova/ })

    expect(alagambe.getAttribute("aria-pressed")).toBe("true")
    expect(fascinate.getAttribute("aria-pressed")).toBe("false")
  })

  it("saves the other one when it is chosen", async () => {
    render(<AppearanceTab />)
    const [, fascinate] = screen.getAllByRole("button", { name: /Tova/ })

    await userEvent.click(fascinate)
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ titleFont: "fascinate" }))
    )
  })

  it("shows each sample in its own face rather than the chosen one", () => {
    render(<AppearanceTab />)
    const [alagambe, fascinate] = screen.getAllByRole("button", { name: /Tova/ })

    expect(alagambe.getAttribute("data-title-font")).toBe("alagambe")
    expect(fascinate.getAttribute("data-title-font")).toBe("fascinate")
  })

  it("offers both line widths, narrow first", () => {
    render(<AppearanceTab />)
    const widths = screen.getAllByRole("button", { name: /Narrow|Full/ })

    expect(widths.map((button) => button.getAttribute("data-prose-width"))).toEqual([
      "narrow",
      "full"
    ])
    expect(widths[0].getAttribute("aria-pressed")).toBe("true")
  })

  it("saves the full width when it is chosen", async () => {
    render(<AppearanceTab />)
    const [, full] = screen.getAllByRole("button", { name: /Narrow|Full/ })

    await userEvent.click(full)
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ proseWidth: "full" }))
    )
  })

  it("keeps the writing sizes with the rest of the type", () => {
    render(<AppearanceTab />)

    expect(screen.getByLabelText("Font size")).toBeDefined()
    expect(screen.getByLabelText("Indent width")).toBeDefined()
  })

  it("offers light, dark and system, starting on system", () => {
    render(<AppearanceTab />)
    const modes = screen.getAllByRole("button", { name: /^(Light|Dark|System)$/ })

    expect(modes.map((m) => m.textContent)).toEqual(["Light", "Dark", "System"])
    expect(screen.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("saves the mode when one is chosen", async () => {
    render(<AppearanceTab />)
    await userEvent.click(screen.getByRole("button", { name: "Dark" }))

    await waitFor(() => expect(write).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" })))
  })

  it("keeps a background per mode", async () => {
    render(<AppearanceTab />)
    const [light, dark] = screen.getAllByRole("button", { name: /lake-sunset/ })

    await userEvent.click(dark)
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundDark: "lake-sunset.jpg", backgroundLight: null })
      )
    )
    expect(light.getAttribute("aria-label")).toContain("light")
  })

  it("offers dark no photograph rather than a shuffle of bright ones", () => {
    render(<AppearanceTab />)
    expect(screen.getByText("None")).toBeDefined()
    expect(screen.getByText("Shuffle")).toBeDefined()
  })

  it("offers a way to add a background to each mode", () => {
    render(<AppearanceTab />)

    expect(screen.getByLabelText("Add a background for light")).toBeDefined()
    expect(screen.getByLabelText("Add a background for dark")).toBeDefined()
  })

  it("adds a background and assigns it to the mode that asked", async () => {
    const addBackground = vi.fn().mockResolvedValue("dusk.jpg")
    const listBackgrounds = vi.fn().mockResolvedValue(["dusk.jpg"])
    window.tova = stubBridge({
      preferences: { write, addBackground, listBackgrounds }
    })

    render(<AppearanceTab />)
    await userEvent.click(screen.getByLabelText("Add a background for dark"))

    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ backgroundDark: "dusk.jpg" }))
    )
  })

  it("does nothing when the picker is cancelled", async () => {
    const addBackground = vi.fn().mockResolvedValue(null)
    window.tova = stubBridge({ preferences: { write, addBackground } })

    render(<AppearanceTab />)
    await userEvent.click(screen.getByLabelText("Add a background for light"))

    expect(write).not.toHaveBeenCalled()
  })

  it("lists an added background beside the bundled ones", () => {
    usePreferencesStore.setState({ userBackgrounds: ["dusk.jpg"] })
    render(<AppearanceTab />)

    expect(screen.getByLabelText("dusk.jpg for dark")).toBeDefined()
    expect(screen.getByLabelText("dusk.jpg for light")).toBeDefined()
  })
})


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
})


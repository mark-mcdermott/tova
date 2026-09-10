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
    expect(screen.getByText("Vibur")).toBeDefined()
    expect(screen.getByText("Fascinate Inline")).toBeDefined()
  })

  it("marks the one in use", () => {
    render(<AppearanceTab />)
    const [vibur, fascinate] = screen.getAllByRole("button", { name: /Tova/ })

    expect(vibur.getAttribute("aria-pressed")).toBe("true")
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
    const [vibur, fascinate] = screen.getAllByRole("button", { name: /Tova/ })

    expect(vibur.getAttribute("data-title-font")).toBe("vibur")
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

    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }))
    )
  })

  it("keeps a background per mode", async () => {
    // It used to click the second lake-sunset button, there being one in each
    // picker. Each mode offers only its own photographs now.
    render(<AppearanceTab />)

    await userEvent.click(screen.getByLabelText("milky-way.jpg for dark"))
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({
          backgroundDark: "milky-way.jpg",
          backgroundLight: DEFAULT_PREFERENCES.backgroundLight
        })
      )
    )
  })

  it("offers None to both modes, which used to be dark's alone", () => {
    // getByText would have thrown on two of either, which is how the asymmetry
    // was pinned: one picker said None, the other said Shuffle.
    render(<AppearanceTab />)
    expect(screen.getAllByText("None")).toHaveLength(2)
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

describe("AppearanceTab added title faces", () => {
  beforeEach(() => {
    // jsdom has no CSS Font Loading API; Electron does.
    vi.stubGlobal(
      "FontFace",
      class {
        async load() {
          return this
        }
      }
    )
    vi.stubGlobal("document", Object.assign(document, { fonts: { add: vi.fn() } }))
  })

  it("lists the faces the reader added beside the bundled ones", async () => {
    window.tova = stubBridge({
      preferences: { write, listTitleFonts: vi.fn(async () => ["my-script.otf"]) }
    })
    render(<AppearanceTab />)

    // "my-script.otf" reads as a face, not as a filename.
    await waitFor(() => expect(screen.getByText("My Script")).toBeDefined())
    expect(screen.getByText("Vibur")).toBeDefined()
  })

  it("offers a way in, and stores what the picker returned", async () => {
    const addTitleFont = vi.fn(async () => "chosen.woff2")
    window.tova = stubBridge({
      preferences: { write, addTitleFont, listTitleFonts: vi.fn(async () => []) }
    })
    render(<AppearanceTab />)

    await userEvent.click(screen.getByRole("button", { name: /Add a font/ }))
    expect(addTitleFont).toHaveBeenCalled()
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ titleFont: "chosen.woff2" }))
    )
  })

  it("stores nothing when the picker was cancelled", async () => {
    window.tova = stubBridge({
      preferences: { write, addTitleFont: vi.fn(async () => null) }
    })
    render(<AppearanceTab />)

    await userEvent.click(screen.getByRole("button", { name: /Add a font/ }))
    expect(write).not.toHaveBeenCalled()
  })

  it("removes an added face without touching the bundled ones", async () => {
    const removeTitleFont = vi.fn(async () => undefined)
    window.tova = stubBridge({
      preferences: {
        write,
        removeTitleFont,
        listTitleFonts: vi.fn(async () => ["my-script.otf"])
      }
    })
    render(<AppearanceTab />)
    await waitFor(() => expect(screen.getByText("My Script")).toBeDefined())

    await userEvent.click(screen.getByRole("button", { name: "Remove My Script" }))
    expect(removeTitleFont).toHaveBeenCalledWith("my-script.otf")
  })
})

describe("AppearanceTab backgrounds", () => {
  it("offers the same controls for light and dark", () => {
    // They diverged because one stored value meant two things: the gradient in
    // dark, a shuffle in light.
    render(<AppearanceTab />)

    for (const theme of ["light", "dark"]) {
      expect(screen.getByLabelText(`No background for ${theme}`)).toBeDefined()
      expect(screen.getByLabelText(`Add a background for ${theme}`)).toBeDefined()
    }
  })

  it("offers each mode only the photographs bundled for it", () => {
    // One picture each, so neither picker can shuffle and neither shows the
    // other's — a bright sky cannot carry white text, and the reverse.
    usePreferencesStore.setState({ userBackgrounds: [] })
    render(<AppearanceTab />)

    expect(screen.getByLabelText("lake-sunset.jpg for light")).toBeDefined()
    expect(screen.queryByLabelText("milky-way.jpg for light")).toBeNull()

    expect(screen.getByLabelText("milky-way.jpg for dark")).toBeDefined()
    expect(screen.queryByLabelText("lake-sunset.jpg for dark")).toBeNull()
  })

  it("hides Shuffle again, since each mode is back to one picture", () => {
    usePreferencesStore.setState({
      userBackgrounds: [],
      preferences: { ...DEFAULT_PREFERENCES, backgroundLight: null, backgroundDark: null }
    })
    render(<AppearanceTab />)

    expect(screen.queryByLabelText("Shuffle for light")).toBeNull()
    expect(screen.queryByLabelText("Shuffle for dark")).toBeNull()
  })

  it("offers the reader's own pictures to both modes", () => {
    // Only the reader knows whether an image of theirs suits one or the other.
    usePreferencesStore.setState({ userBackgrounds: ["mine.jpg"] })
    render(<AppearanceTab />)

    expect(screen.getByLabelText("mine.jpg for light")).toBeDefined()
    expect(screen.getByLabelText("mine.jpg for dark")).toBeDefined()
  })

  it("offers Shuffle once a second picture has been added", () => {
    usePreferencesStore.setState({ userBackgrounds: ["mine.jpg"] })
    render(<AppearanceTab />)

    expect(screen.getByLabelText("Shuffle for light")).toBeDefined()
    expect(screen.getByLabelText("Shuffle for dark")).toBeDefined()
  })

  it("keeps Shuffle on screen when it is the choice already stored", () => {
    // Or the picker would show nothing chosen at all.
    usePreferencesStore.setState({
      userBackgrounds: [],
      preferences: { ...DEFAULT_PREFERENCES, backgroundLight: "shuffle" }
    })
    render(<AppearanceTab />)

    const shuffle = screen.getByLabelText("Shuffle for light")
    expect(shuffle.getAttribute("aria-pressed")).toBe("true")
  })

  it("stores none as null and shuffle by name", async () => {
    usePreferencesStore.setState({ userBackgrounds: ["mine.jpg"] })
    render(<AppearanceTab />)

    const user = userEvent.setup()
    await user.click(screen.getByLabelText("No background for dark"))
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ backgroundDark: null }))

    await user.click(screen.getByLabelText("Shuffle for dark"))
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ backgroundDark: "shuffle" }))
  })
})

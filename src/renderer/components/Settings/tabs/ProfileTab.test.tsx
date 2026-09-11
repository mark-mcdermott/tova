import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProfileTab } from "./ProfileTab"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { stubBridge } from "../../../testing/bridge"
import {
  AvatarChoice,
  AvatarSources,
  DEFAULT_PREFERENCES,
  NO_AVATARS
} from "../../../../shared/preferences"
import { discColor, tovaAvatarUrl } from "../../../avatar"

const write = vi.fn()
const chooseAvatar = vi.fn()

function store(avatar: AvatarChoice, sources: AvatarSources) {
  usePreferencesStore.setState({
    preferences: {
      ...DEFAULT_PREFERENCES,
      displayNameSource: "custom",
      displayName: "Mark McDermott",
      avatar
    },
    avatarSources: sources,
    // Reset with everything else: a test that sets one would otherwise leave
    // it set for the next.
    accountName: ""
  })
}

/** The swatch, which is the colour input itself. */
function swatch(): HTMLInputElement {
  return screen.getByLabelText("Avatar background color") as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  write.mockImplementation(async (value: unknown) => value)
  window.tova = stubBridge({ preferences: { write } })
  usePreferencesStore.setState({ chooseAvatar })
  store("initials", NO_AVATARS)
})

afterEach(cleanup)

/** The options the picker is actually showing, by their labels. */
function choices(): HTMLElement[] {
  return screen
    .getAllByRole("button")
    .filter((button) => button.classList.contains("avatar-choice"))
    .filter((button) => button.hasAttribute("aria-pressed"))
}

/** Their labels, read off the same element every picker in Settings labels with. */
function offered(): string[] {
  return choices().map((button) => button.querySelector(".choice-name")?.textContent ?? "")
}

describe("the avatar picker", () => {
  it("offers the initials and the robot on a machine with nothing else", () => {
    render(<ProfileTab />)

    expect(offered()).toEqual(["Initials", "Tova Robot"])
  })

  it("marks the one in use", () => {
    render(<ProfileTab />)
    const [initials, tova] = choices()

    expect(initials.getAttribute("aria-pressed")).toBe("true")
    expect(tova.getAttribute("aria-pressed")).toBe("false")
  })

  it("draws each option as the face it would give", () => {
    // The point of the picker: a reader chooses by eye rather than by guessing
    // what "Tova" is going to look like.
    const { container } = render(<ProfileTab />)
    const faces = [...container.querySelectorAll("img")]

    expect(faces.some((face) => face.getAttribute("src") === tovaAvatarUrl)).toBe(true)
    expect(screen.getByText("MM")).toBeDefined()
  })

  it("saves the choice", async () => {
    render(<ProfileTab />)
    await userEvent.click(screen.getByRole("button", { name: "Tova Robot" }))

    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0].avatar).toBe("tova")
  })

  it("leads with the account picture where there is one", () => {
    // It is the one that is already a portrait of the reader.
    store("initials", { system: "data:system", custom: "data:custom" })
    render(<ProfileTab />)

    expect(offered()).toEqual(["Mac Account Avatar", "Initials", "Tova Robot", "Picture"])
  })

  it("offers the account picture only where there is one to offer", () => {
    render(<ProfileTab />)
    expect(offered()).not.toContain("Mac Account Avatar")

    cleanup()
    store("initials", { system: "data:system", custom: null })
    render(<ProfileTab />)
    expect(offered()).toContain("Mac Account Avatar")
  })

  it("offers the chosen picture only once one has been chosen", () => {
    render(<ProfileTab />)
    expect(offered()).not.toContain("Picture")

    cleanup()
    store("custom", { system: null, custom: "data:custom" })
    render(<ProfileTab />)
    expect(offered()).toContain("Picture")
  })
})

describe("the picture behind the Picture option", () => {
  it("is only offered for removal once there is one", () => {
    render(<ProfileTab />)
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()

    cleanup()
    store("custom", { system: null, custom: "data:custom" })
    render(<ProfileTab />)
    expect(screen.getByRole("button", { name: /Remove/ })).toBeDefined()
  })

  it("is uploaded from an opening in the row, not a button beside it", () => {
    render(<ProfileTab />)
    const upload = screen.getByRole("button", { name: "Upload" })

    // A tile in the row, and not one of the faces on offer.
    expect(upload.classList.contains("avatar-choice")).toBe(true)
    expect(upload.hasAttribute("aria-pressed")).toBe(false)
    expect(offered()).not.toContain("Upload")
  })

  it("opens the picker from it", async () => {
    render(<ProfileTab />)
    await userEvent.click(screen.getByRole("button", { name: "Upload" }))

    expect(chooseAvatar).toHaveBeenCalled()
  })

  it("hangs the × directly on the tile, which is what reveals it", () => {
    // The stylesheet reveals a .choice-remove whose own parent is hovered. Put
    // it a level deeper and it would be invisible and reachable by keyboard
    // alone — which is how the first version of this went wrong.
    store("custom", { system: null, custom: "data:custom" })
    render(<ProfileTab />)
    const remove = screen.getByRole("button", { name: /Remove/ })

    expect(remove.parentElement?.classList.contains("avatar-choice")).toBe(true)
  })

  it("takes the choice off it when it goes", async () => {
    // Otherwise the picker would say Picture while the sidebar showed initials,
    // and the next Choose would look like it had done nothing.
    store("custom", { system: null, custom: "data:custom" })
    render(<ProfileTab />)
    await userEvent.click(screen.getByRole("button", { name: /Remove/ }))

    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0].avatarFile).toBeNull()
    expect(write.mock.calls[0][0].avatar).toBe("initials")
  })

  it("leaves another choice alone when the picture goes", async () => {
    store("tova", { system: null, custom: "data:custom" })
    render(<ProfileTab />)
    await userEvent.click(screen.getByRole("button", { name: /Remove/ }))

    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0].avatar).toBe("tova")
  })
})

describe("the background colour", () => {
  it("opens on the colour the disc is already wearing", () => {
    render(<ProfileTab />)

    expect(swatch().value).toBe(discColor(null))
  })

  it("follows the wheel before it writes anything", async () => {
    // The system picker reports every move. Writing each one would be a
    // hundred writes for one choice, so the tiles follow and the file waits.
    vi.useFakeTimers()
    render(<ProfileTab />)
    fireEvent.input(swatch(), { target: { value: "#112233" } })

    expect(swatch().value).toBe("#112233")
    expect(write).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(write.mock.calls[0][0].avatarColor).toBe("#112233")
    vi.useRealTimers()
  })

  it("writes once for a drag across many colours", async () => {
    vi.useFakeTimers()
    render(<ProfileTab />)
    for (const value of ["#111111", "#222222", "#333333"]) {
      fireEvent.input(swatch(), { target: { value } })
      vi.advanceTimersByTime(60)
    }

    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0].avatarColor).toBe("#333333")
    vi.useRealTimers()
  })
})

describe("where the display name comes from", () => {
  /** The name options, which are the compact choices rather than the tiles. */
  function sources(): HTMLElement[] {
    return screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("choice-compact"))
  }

  function labels(): string[] {
    return sources().map((button) => button.textContent ?? "")
  }

  it("offers the account name, a typed one, and none at all", () => {
    usePreferencesStore.setState({ accountName: "stuxxnet" })
    render(<ProfileTab />)

    expect(labels()).toEqual(["Mac account name", "Custom", "None"])
  })

  it("keeps the account name back where there is no account to ask", () => {
    render(<ProfileTab />)

    expect(labels()).toEqual(["Custom", "None"])
  })

  it("marks the one in use and saves another when it is chosen", async () => {
    usePreferencesStore.setState({ accountName: "stuxxnet" })
    render(<ProfileTab />)
    expect(screen.getByRole("button", { name: "Custom" }).getAttribute("aria-pressed")).toBe("true")

    await userEvent.click(screen.getByRole("button", { name: "Mac account name" }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0].displayNameSource).toBe("system")
  })

  it("asks for a name only where there is one to type", () => {
    usePreferencesStore.setState({ accountName: "stuxxnet" })
    render(<ProfileTab />)
    expect(screen.getByPlaceholderText("Your name")).toBeDefined()

    cleanup()
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, displayNameSource: "system" },
      accountName: "stuxxnet"
    })
    render(<ProfileTab />)
    expect(screen.queryByPlaceholderText("Your name")).toBeNull()
  })

  it("keeps what was typed while another source is in use", async () => {
    // Switching to the account name for a while should not throw the typed one
    // away — it is still there to come back to.
    render(<ProfileTab />)
    await userEvent.click(screen.getByRole("button", { name: "None" }))

    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0].displayName).toBe("Mark McDermott")
    expect(write.mock.calls[0][0].displayNameSource).toBe("none")
  })

  it("draws the faces with the name the source gives, not the one typed", () => {
    // The initials follow whatever the sidebar will show.
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, displayNameSource: "system", displayName: "Mark" },
      accountName: "Ada Lovelace"
    })
    render(<ProfileTab />)

    expect(screen.getByText("AL")).toBeDefined()
  })
})

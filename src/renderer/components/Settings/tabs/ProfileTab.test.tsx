import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
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
import { tovaAvatarUrl } from "../../../avatar"

const write = vi.fn()

function store(avatar: AvatarChoice, sources: AvatarSources) {
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, displayName: "Mark McDermott", avatar },
    avatarSources: sources
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  write.mockImplementation(async (value: unknown) => value)
  window.tova = stubBridge({ preferences: { write } })
  store("initials", NO_AVATARS)
})

afterEach(cleanup)

/** The options the picker is actually showing, by their labels. */
function choices(): HTMLElement[] {
  return screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"))
}

/** Their labels, read off the same element every picker in Settings labels with. */
function offered(): string[] {
  return choices().map((button) => button.querySelector(".choice-name")?.textContent ?? "")
}

describe("the avatar picker", () => {
  it("offers the initials and the robot on a machine with nothing else", () => {
    render(<ProfileTab />)

    expect(offered()).toEqual(["Initials", "The Tova robot"])
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
    await userEvent.click(screen.getByRole("button", { name: "The Tova robot" }))

    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(write.mock.calls[0][0].avatar).toBe("tova")
  })

  it("offers the account picture only where there is one to offer", () => {
    render(<ProfileTab />)
    expect(offered()).not.toContain("Account")

    cleanup()
    store("initials", { system: "data:system", custom: null })
    render(<ProfileTab />)
    expect(offered()).toContain("Account")
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
    expect(screen.getByRole("button", { name: "Choose a picture…" })).toBeDefined()
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

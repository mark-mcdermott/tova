import { describe, it, expect, vi, beforeEach } from "vitest"
import { usePreferencesStore } from "./preferencesStore"
import { DEFAULT_PREFERENCES } from "../../shared/preferences"
import { stubBridge } from "../testing/bridge"

const write = vi.fn()
const avatarSources = vi.fn()

const OLD = { system: null, custom: "data:image/jpeg;base64,OLD" }

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge({ preferences: { write, avatarSources } })
  write.mockImplementation(async (next) => next)
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, avatar: "custom", avatarFile: "avatar.jpg" },
    avatarSources: OLD,
    loaded: true
  })
})

describe("changing the avatar", () => {
  it("pulls the pictures again when the file changes", async () => {
    // Removing one wrote the change to disk and left the old portrait on
    // screen, which read as the button being slow rather than as nothing
    // having happened.
    avatarSources.mockResolvedValue({ system: null, custom: null })
    await usePreferencesStore.getState().update({ avatarFile: null })

    expect(avatarSources).toHaveBeenCalled()
    expect(usePreferencesStore.getState().avatarSources.custom).toBeNull()
  })

  it("shows the newly chosen picture rather than the one it replaced", async () => {
    avatarSources.mockResolvedValue({ system: null, custom: "data:image/png;base64,NEW" })
    await usePreferencesStore.getState().update({ avatarFile: "avatar.png" })

    expect(usePreferencesStore.getState().avatarSources.custom).toBe("data:image/png;base64,NEW")
  })

  it("does not re-read the pictures for an unrelated preference", async () => {
    await usePreferencesStore.getState().update({ fontSize: 20 })

    expect(avatarSources).not.toHaveBeenCalled()
    expect(usePreferencesStore.getState().avatarSources).toEqual(OLD)
  })

  it("does not re-read them for a change of choice either, the faces being the same", async () => {
    // Switching between the four only changes which of them is drawn. The
    // pictures behind them have not moved.
    await usePreferencesStore.getState().update({ avatar: "initials" })

    expect(avatarSources).not.toHaveBeenCalled()
    expect(usePreferencesStore.getState().preferences.avatar).toBe("initials")
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { usePreferencesStore } from "./preferencesStore"
import { DEFAULT_PREFERENCES } from "../../shared/preferences"
import { stubBridge } from "../testing/bridge"

const write = vi.fn()
const avatarUrl = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  window.tova = stubBridge({ preferences: { write, avatarUrl } })
  write.mockImplementation(async (next) => next)
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, avatarFile: "avatar.jpg" },
    avatarUrl: "data:image/jpeg;base64,OLD",
    loaded: true
  })
})

describe("changing the avatar", () => {
  it("pulls the new picture when the file changes", async () => {
    // Removing one wrote the change to disk and left the old portrait on
    // screen, which read as the button being slow rather than as nothing
    // having happened.
    avatarUrl.mockResolvedValue(null)
    await usePreferencesStore.getState().update({ avatarFile: null })

    expect(avatarUrl).toHaveBeenCalled()
    expect(usePreferencesStore.getState().avatarUrl).toBeNull()
  })

  it("shows the newly chosen picture rather than the one it replaced", async () => {
    avatarUrl.mockResolvedValue("data:image/png;base64,NEW")
    await usePreferencesStore.getState().update({ avatarFile: "avatar.png" })

    expect(usePreferencesStore.getState().avatarUrl).toBe("data:image/png;base64,NEW")
  })

  it("does not re-read the picture for an unrelated preference", async () => {
    await usePreferencesStore.getState().update({ fontSize: 20 })

    expect(avatarUrl).not.toHaveBeenCalled()
    expect(usePreferencesStore.getState().avatarUrl).toBe("data:image/jpeg;base64,OLD")
  })
})

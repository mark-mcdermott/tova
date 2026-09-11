import { describe, it, expect } from "vitest"
import { NO_AVATARS, normalizePreferences } from "../shared/preferences"
import { offersAvatar, resolveAvatar, tovaAvatarUrl } from "./avatar"

const both = { system: "data:system", custom: "data:custom" }

describe("which face a choice draws", () => {
  it("draws nothing for the initials, which are not a picture", () => {
    expect(resolveAvatar("initials", both)).toBeNull()
  })

  it("draws the bundled robot for Tova", () => {
    expect(resolveAvatar("tova", NO_AVATARS)).toBe(tovaAvatarUrl)
  })

  it("draws the account picture and the chosen one from their own sources", () => {
    expect(resolveAvatar("system", both)).toBe("data:system")
    expect(resolveAvatar("custom", both)).toBe("data:custom")
  })

  it("falls back to the initials when the picture behind a choice has gone", () => {
    // A chosen file deleted underneath the app, or an account picture cleared
    // in System Settings. Initials are a better answer than a broken image.
    expect(resolveAvatar("custom", NO_AVATARS)).toBeNull()
    expect(resolveAvatar("system", NO_AVATARS)).toBeNull()
  })
})

describe("which choices are worth offering", () => {
  it("always offers the two that need nothing fetched", () => {
    expect(offersAvatar("initials", NO_AVATARS)).toBe(true)
    expect(offersAvatar("tova", NO_AVATARS)).toBe(true)
  })

  it("keeps the account back on a machine with no picture set", () => {
    expect(offersAvatar("system", NO_AVATARS)).toBe(false)
    expect(offersAvatar("system", both)).toBe(true)
  })

  it("keeps the picture back until one has been chosen", () => {
    expect(offersAvatar("custom", NO_AVATARS)).toBe(false)
    expect(offersAvatar("custom", both)).toBe(true)
  })
})

describe("a preferences file written before the choices existed", () => {
  it("reads a stored picture as the one being used", () => {
    // A file was the only thing that could mean anything then, so anyone with
    // one was looking at it.
    expect(normalizePreferences({ avatarFile: "avatar.jpg" }).avatar).toBe("custom")
  })

  it("reads no picture as the initials", () => {
    expect(normalizePreferences({ avatarFile: null }).avatar).toBe("initials")
  })

  it("leaves a stored choice alone", () => {
    const stored = { avatar: "tova", avatarFile: "avatar.jpg" }
    expect(normalizePreferences(stored).avatar).toBe("tova")
  })

  it("refuses a choice that is not one of the four", () => {
    expect(normalizePreferences({ avatar: "robot", avatarFile: null }).avatar).toBe("initials")
  })
})

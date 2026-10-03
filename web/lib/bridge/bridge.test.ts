import { describe, it, expect, vi } from "vitest"
import { webBridge, type SettingsStore } from "./index"
import { inMemoryNotes } from "../testing"
import { NotOnTheWeb } from "./refuse"
import { DEFAULT_PREFERENCES } from "../../../src/shared/preferences"

function fakeSettings(start: Record<string, unknown> = {}): SettingsStore & {
  held: Record<string, unknown>
} {
  const held = { ...start }
  return {
    held,
    read: async <T>(key: string) => held[key] as T | undefined,
    write: async (key, value) => void (held[key] = value)
  }
}

describe("preferences", () => {
  it("answers with the defaults when nothing has been stored", async () => {
    const tova = webBridge(fakeSettings(), inMemoryNotes())

    expect(await tova.preferences.read()).toEqual(DEFAULT_PREFERENCES)
  })

  /*
   * Through `normalizePreferences` on the way in as well as the way out. What
   * is in IndexedDB was put there by an older version of this app, and a
   * preference that has since changed shape must not reach the renderer as it
   * was written.
   */
  it("tidies what it finds, rather than trusting it", async () => {
    const tova = webBridge(fakeSettings({ preferences: { proseWidth: "enormous", nonsense: 1 } }))

    const read = await tova.preferences.read()

    expect(read).not.toHaveProperty("nonsense")
    expect(read.proseWidth).toBe(DEFAULT_PREFERENCES.proseWidth)
  })

  /*
   * A stored preferences object with no background chosen is not the same as
   * never having stored one: the first says "none", the second has not been
   * asked. `normalizePreferences` keeps them apart and this is the one place
   * the difference is visible, so it is worth a case of its own rather than an
   * assertion that quietly wanted them equal.
   */
  it("keeps 'no background chosen' apart from 'never asked'", async () => {
    const asked = await webBridge(fakeSettings({ preferences: {} })).preferences.read()
    const never = await webBridge(fakeSettings(), inMemoryNotes()).preferences.read()

    expect(asked.backgroundLight).toBeNull()
    expect(never.backgroundLight).toBe(DEFAULT_PREFERENCES.backgroundLight)
  })

  it("stores what it tidied, not what it was handed", async () => {
    const settings = fakeSettings()
    const tova = webBridge(settings, inMemoryNotes())

    const written = await tova.preferences.write({
      ...DEFAULT_PREFERENCES,
      nonsense: 1
    } as never)

    expect(written).toEqual(DEFAULT_PREFERENCES)
    expect(settings.held.preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it("comes back from a reset as the defaults", async () => {
    const settings = fakeSettings({ preferences: { ...DEFAULT_PREFERENCES, lineWidth: "wide" } })
    const tova = webBridge(settings, inMemoryNotes())

    await tova.preferences.reset()

    expect(await tova.preferences.read()).toEqual(DEFAULT_PREFERENCES)
  })
})

describe("the last screen", () => {
  it("remembers one and gives it back", async () => {
    const settings = fakeSettings()
    const tova = webBridge(settings, inMemoryNotes())

    await tova.session.write({ kind: "note", noteId: "notes/slow-morning.md" })

    expect(await tova.session.read()).toEqual({ kind: "note", noteId: "notes/slow-morning.md" })
  })

  /*
   * A stored session is attacker-reachable in a way a file on disk is not —
   * anything with this origin can write to IndexedDB. `normalizeScreen` is what
   * stops a note id that climbs out of the vault, and it has to run on read.
   */
  it("refuses a stored screen that is not one", async () => {
    const tova = webBridge(fakeSettings({ session: { kind: "note", noteId: "../../etc/passwd" } }))

    expect(await tova.session.read()).toBeNull()
  })

  it("has nowhere to return to when nothing was stored", async () => {
    expect(await webBridge(fakeSettings(), inMemoryNotes()).session.read()).toBeNull()
  })
})

describe("what a browser will not do", () => {
  const tova = webBridge(fakeSettings(), inMemoryNotes())

  /*
   * Two reasons, kept apart. They read the same to a stack trace and mean
   * opposite things to whoever decides what to build next.
   */
  it("says a thing is not built yet", async () => {
    await expect(tova.images.save("a.png", new Uint8Array())).rejects.toMatchObject({
      name: "NotOnTheWeb",
      because: "not yet",
      method: "images.save"
    })
  })

  it("says a thing a browser cannot do at all", async () => {
    await expect(tova.preferences.addVault()).rejects.toMatchObject({
      name: "NotOnTheWeb",
      because: "unavailable",
      method: "preferences.addVault"
    })
  })

  it("explains itself differently for each", async () => {
    const notYet = await tova.backups.run().catch((error: NotOnTheWeb) => error.message)
    const never = await tova.app.reveal("vault").catch((error: NotOnTheWeb) => error.message)

    expect(notYet).toContain("not built on the web yet")
    expect(never).toContain("a browser cannot")
  })
})

describe("what it answers truthfully rather than refusing", () => {
  const tova = webBridge(fakeSettings(), inMemoryNotes())

  /*
   * A new browser holds no notes. That is not a gap, and answering it with an
   * error would put a crash where an empty list belongs.
   */
  it("has no notes, no folders and no backups", async () => {
    expect(await tova.notes.list()).toEqual([])
    expect(await tova.notes.listFolders()).toEqual([])
    expect(await tova.backups.status()).toEqual({ empty: true, backups: [] })
  })

  /*
   * A browser has no keychain. Saying so is what keeps the blog screens from
   * offering to store a token they would have to keep in the clear.
   */
  it("admits it cannot keep a secret", async () => {
    expect(await tova.blogs.canStoreSecrets()).toBe(false)
  })

  it("has no dictionary and does not pretend otherwise", async () => {
    expect(await tova.grammar.status()).toEqual({ ready: false, bytes: 0, version: "" })
  })
})

describe("opening a link", () => {
  /*
   * `noopener` because the opened page gets a handle on this one otherwise,
   * and this one is holding a decryption key.
   */
  it("hands the new page no way back to this one", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)

    await webBridge(fakeSettings(), inMemoryNotes()).app.openExternal("https://tova.so")

    expect(open).toHaveBeenCalledWith("https://tova.so", "_blank", "noopener,noreferrer")
  })
})

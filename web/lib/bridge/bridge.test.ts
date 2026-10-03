import { describe, it, expect, vi } from "vitest"
import { webBridge, type SettingsStore } from "./index"
import { inMemoryNotes } from "../testing"
import { signal } from "../signal"
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

    expect(await tova.preferences.read()).toEqual({
      ...DEFAULT_PREFERENCES,
      ...{ greeted: true, grammar: false, updates: false }
    })
  })

  /*
   * The first-run question gathers two costs — a 15MB dictionary and an update
   * check — and a browser has neither. A question that gathers nothing is the
   * second first-run question CLAUDE.md says to resist, and it would ask it in
   * copy about a Mac: "nothing leaves this machine", which is not true of a
   * browser signed in to an account.
   */
  it("starts greeted, because there is nothing to ask a browser", async () => {
    const read = await webBridge(fakeSettings(), inMemoryNotes()).preferences.read()

    expect(read.greeted).toBe(true)
    expect(read.updates).toBe(false)
    expect(read.grammar).toBe(false)
  })

  /*
   * A starting point, not a rule. Somebody who turns grammar on — once there
   * is a grammar to turn on — must not be told otherwise on the next load.
   */
  it("lets what was stored win over where it started", async () => {
    const tova = webBridge(
      fakeSettings({ preferences: { ...DEFAULT_PREFERENCES, grammar: true, greeted: false } }),
      inMemoryNotes()
    )

    const read = await tova.preferences.read()

    expect(read.grammar).toBe(true)
    expect(read.greeted).toBe(false)
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

  /*
   * Back to where a browser starts, which is not quite where the defaults are.
   * A reset that made the web start asking the first-run question again would
   * be asking it for the first time, in copy about a Mac.
   */
  it("comes back from a reset to where a browser starts", async () => {
    const settings = fakeSettings({ preferences: { ...DEFAULT_PREFERENCES, greeted: false } })
    const tova = webBridge(settings, inMemoryNotes())

    await tova.preferences.reset()
    const read = await tova.preferences.read()

    expect(read.greeted).toBe(true)
    expect(read.proseWidth).toBe(DEFAULT_PREFERENCES.proseWidth)
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

describe("the two signals", () => {
  const wired = () => {
    const localChanged = signal()
    const vaultChanged = signal()
    const tova = webBridge(fakeSettings(), inMemoryNotes(), localChanged, vaultChanged)
    return { tova, localChanged, vaultChanged }
  }

  /*
   * `onNotesChanged` is documented as changes made elsewhere. Handing it this
   * tab's own writes would make the renderer reload after every keystroke it
   * had just handled — and a reload mid-sentence is the kind of bug that is
   * very hard to describe and very easy to notice.
   */
  it("does not tell the renderer about this tab's own writes", async () => {
    const { tova } = wired()
    const reload = vi.fn()
    tova.events.onNotesChanged(reload)

    await tova.notes.create({ section: "notes", title: "River" })

    expect(reload).not.toHaveBeenCalled()
  })

  it("tells the renderer when a sync took something", () => {
    const { tova, vaultChanged } = wired()
    const reload = vi.fn()
    tova.events.onNotesChanged(reload)

    vaultChanged.announce()

    expect(reload).toHaveBeenCalledOnce()
  })

  it("tells a sync there is something to push, on every write", async () => {
    const { tova, localChanged } = wired()
    const wrote = vi.fn()
    localChanged.listen(wrote)

    const made = await tova.notes.create({ section: "notes", title: "River" })
    await tova.notes.write(made.id, "River", "Water.")

    expect(wrote).toHaveBeenCalledTimes(2)
  })

  it("stops telling a renderer that stopped listening", () => {
    const { tova, vaultChanged } = wired()
    const reload = vi.fn()

    tova.events.onNotesChanged(reload)()
    vaultChanged.announce()

    expect(reload).not.toHaveBeenCalled()
  })
})

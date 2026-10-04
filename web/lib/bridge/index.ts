/**
 * `window.tova`, for a browser.
 *
 * The desktop builds this out of Tauri commands in `src-tauri/bridge.js`. This
 * is the same surface over HTTP, IndexedDB and the browser's own facilities,
 * and it is typed as `TovaBridge` so the compiler — rather than a screen in
 * front of somebody — says when a method is missing.
 *
 * Most of it refuses, and the refusals carry which of two reasons applies.
 * `docs/ROADMAP.md` has the inventory: 74 methods, 13 of them called to boot,
 * and the real work is notes and preferences.
 */

import { normalizePreferences, type Preferences } from "../../../src/shared/preferences"
import { normalizeScreen, type Screen } from "../../../src/shared/screen"
import { NO_AVATARS } from "../../../src/shared/preferences"
import type { NoteStore } from "../../../src/shared/noteStore"
import type { TovaBridge } from "../../../src/shared/types"
import { chooseAvatar } from "./avatar"
import { webNotes } from "./notes"
import { webSync } from "./sync"
import { notYet, unavailable } from "./refuse"
import { read, write } from "./settings"
import { listVersions, readVersion, webNoteStore } from "../noteStore"
import { signal, type Signal } from "../../../src/shared/signal"

/**
 * Where a preference and the last screen are kept.
 *
 * Injected for the reason the vault client's `Credentials` is: what is worth
 * testing here is the normalising on each side of the store, and jsdom has no
 * IndexedDB to put anything in.
 */
export type SettingsStore = {
  read: <T>(key: string) => Promise<T | undefined>
  write: (key: string, value: unknown) => Promise<void>
}

const PREFERENCES = "preferences"

/**
 * Where a browser starts, and why it is not asked.
 *
 * Tova asks one question on first run, and `CLAUDE.md` is explicit about what
 * earns it the right to: it gathers the two costs that already exist — the
 * grammar dictionary's 15MB and the update check's connection — into one
 * moment rather than ambushing somebody in Settings later.
 *
 * On the web neither cost exists. There is no update check, because the page
 * open in front of somebody *is* the latest one; and grammar is not built
 * here, so there is nothing to download. A question that gathers nothing is
 * the "second first-run question" that document says to resist, and it would
 * be asking it in copy written about a Mac: a 15MB dictionary, macOS's own
 * spellchecker, and "nothing leaves this machine" — which is not true of a
 * browser signed in to an account.
 *
 * So `greeted` starts true. Not because anybody was greeted, but because there
 * is nothing left to ask. When grammar is built for the web it arrives the way
 * everything else that costs something does: off, in Settings, discoverable.
 *
 * Only a starting point. The moment anything is stored, what is stored wins —
 * a reader who turns grammar on is not told otherwise on the next page load.
 */
const FIRST_RUN = { greeted: true, grammar: false, updates: false }
const SESSION = "session"
/** Folders somebody made before there was anything to put in them. */
const FOLDERS = "emptyFolders"
/** The picture somebody chose, as a data URL. */
const AVATAR = "avatar"

/**
 * Backgrounds and title faces the reader added.
 *
 * Empty rather than refused: the desktop serves these off disk over its own
 * URL scheme, and a browser simply has none of them. An empty list is the
 * truthful answer, and the Appearance screen renders it as "none added" rather
 * than as an error.
 */
const none = () => Promise.resolve<string[]>([])

export function webBridge(
  settings: SettingsStore = { read, write },
  notes: NoteStore = webNoteStore(),
  /*
   * Two signals, because they mean different things. `localChanged` is this
   * tab saying it wrote; `vaultChanged` is a sync saying it took something.
   * `EventsApi.onNotesChanged` is documented as changes made elsewhere, and
   * handing it this tab's own writes would make the renderer reload after
   * every keystroke it had just handled.
   */
  localChanged: Signal = signal(),
  vaultChanged: Signal = signal()
): TovaBridge {
  const api = webNotes(
    notes,
    {
      read: async () => (await settings.read<string[]>(FOLDERS)) ?? [],
      write: (folders) => settings.write(FOLDERS, folders)
    },
    localChanged.announce
  )

  /**
   * A note's uid, from the path the renderer calls it by.
   *
   * Versions are kept against the uid, which survives a rename; the renderer
   * addresses a note by a path, which does not. Looking it up is what keeps a
   * note's history attached to the note rather than to the name it had when
   * the version was taken.
   */
  const uidFor = async (noteId: string): Promise<string> => {
    const found = (await api.list()).find((one) => one.id === noteId)
    if (found?.uid === undefined) throw new Error(`There is no note at ${noteId}`)
    return found.uid
  }

  return {
    notes: api,

    backups: {
      /*
       * A vault is empty until the notes model exists, and there are no
       * backups because there is no folder to copy. `.versions` is the
       * desktop's floor under a bad merge and the web has none — on the
       * roadmap, and said plainly rather than answered with a lie.
       */
      status: () => Promise.resolve({ empty: true, backups: [] }),
      list: () => Promise.resolve([]),

      /*
       * Real, and the reason is `docs/SYNC.md` rather than a feature request:
       * the conflict story says a bad merge is recoverable because every
       * version is kept, and that was true of the desktop's `.versions` and of
       * nothing else. A note's last ten live beside it now.
       */
      listVersions: async (noteId) => listVersions(await uidFor(noteId)),
      readVersion: async (noteId, version) => readVersion(await uidFor(noteId), version),

      /*
       * A backup is a copy of a folder. There is no folder here, and a copy of
       * IndexedDB inside IndexedDB would be a copy in the one place a lost
       * browser profile takes with it. Export is what the web has instead.
       */
      run: unavailable("backups.run"),
      restore: unavailable("backups.restore")
    },

    images: { save: notYet("images.save") },

    blogs: {
      /*
       * Deferred under the no-blog-at-first scope, so the lists are empty and
       * the rest refuses. `canStoreSecrets` is false and means it: a browser
       * has no keychain, and a token kept anywhere else would be a token in
       * the clear.
       */
      list: () => Promise.resolve([]),
      canStoreSecrets: () => Promise.resolve(false),
      lastSynced: () => Promise.resolve({}),
      save: notYet("blogs.save"),
      remove: notYet("blogs.remove"),
      postCount: () => Promise.resolve(0),
      setSecret: unavailable("blogs.setSecret"),
      sync: notYet("blogs.sync"),
      conflict: notYet("blogs.conflict"),
      resolve: notYet("blogs.resolve"),
      deletePost: notYet("blogs.deletePost")
    },

    publish: {
      start: notYet("publish.start"),
      onUpdate: () => () => {}
    },

    spellcheck: {
      /*
       * The browser's own, which is always on and has no switch here. The
       * desktop asks macOS the same questions through a command; a webview
       * answers them itself through `spellcheck` on the element.
       */
      check: () => Promise.resolve([]),
      onSuggest: () => () => {},
      replace: () => Promise.resolve(),
      addWord: () => Promise.resolve([]),
      removeWord: () => Promise.resolve([]),
      listWords: () => Promise.resolve([]),
      setEnabled: () => Promise.resolve()
    },

    /*
     * Harper's dictionary is 15MB and ships off, which is the one first-run
     * question Tova asks. Downloading it into a browser is a different
     * decision from downloading it onto a Mac, and not one to make by
     * inheriting the answer.
     */
    grammar: {
      status: () => Promise.resolve({ ready: false, bytes: 0, version: "" }),
      fetch: notYet("grammar.fetch")
    },

    preferences: {
      async read() {
        const stored = await settings.read<unknown>(PREFERENCES)
        return stored === undefined
          ? { ...normalizePreferences(undefined), ...FIRST_RUN }
          : normalizePreferences(stored)
      },
      async write(preferences: Preferences) {
        const tidied = normalizePreferences(preferences)
        await settings.write(PREFERENCES, tidied)
        return tidied
      },

      /*
       * No macOS account to ask — `system` is a Mac's own account picture and
       * a browser has none. `custom` is real: the browser has a picker of its
       * own, so the one thing this screen offers that a browser can do, it
       * does.
       */
      async avatarSources() {
        return { ...NO_AVATARS, custom: (await settings.read<string>(AVATAR)) ?? null }
      },
      accountName: () => Promise.resolve(""),

      async chooseAvatar() {
        const picture = await chooseAvatar()
        // Dismissed. Nothing stored, and the choice left as it was.
        if (picture === null) return null

        await settings.write(AVATAR, picture)
        return picture
      },

      listBackgrounds: none,
      listTitleFonts: none,
      addBackground: unavailable("preferences.addBackground"),
      addTitleFont: unavailable("preferences.addTitleFont"),
      removeTitleFont: unavailable("preferences.removeTitleFont"),
      titleFontUrl: () => Promise.resolve(null),

      /*
       * A vault is a directory on the desktop. Here there is one account and
       * one set of notes, so there is nothing to list, add or switch between —
       * and the per-vault encryption these describe is the account's envelope
       * instead, which the auth screens own.
       */
      listVaults: () => Promise.resolve([]),
      addVault: unavailable("preferences.addVault"),
      useVault: unavailable("preferences.useVault"),
      forgetVault: unavailable("preferences.forgetVault"),
      encryptVault: unavailable("preferences.encryptVault"),
      decryptVault: unavailable("preferences.decryptVault"),
      unlockVault: unavailable("preferences.unlockVault"),

      reset: () => settings.write(PREFERENCES, undefined),
      nukeTargets: () => Promise.resolve([]),
      nuke: unavailable("preferences.nuke"),
      tagPurgePlan: notYet("preferences.tagPurgePlan"),
      tagPurge: notYet("preferences.tagPurge")
    },

    session: {
      async read(): Promise<Screen | null> {
        return normalizeScreen(await settings.read<unknown>(SESSION))
      },
      async write(screen: Screen) {
        await settings.write(SESSION, screen)
      }
    },

    app: {
      info: () =>
        Promise.resolve({
          platform: "web" as const,
          version: "web",
          tauri: "",
          webview: navigator.userAgent,
          vaultPath: "",
          backupPath: ""
        }),
      /** No Finder to open, and nothing on disk to open it at. */
      reveal: unavailable("app.reveal"),
      async openExternal(url: string) {
        // `noopener` because the opened page gets a handle on this one
        // otherwise, and this one is holding a decryption key.
        window.open(url, "_blank", "noopener,noreferrer")
      }
    },

    sync: webSync(),

    events: {
      /*
       * A sync that pulled something, not this tab's own writes. The
       * difference is the whole reason there are two signals.
       */
      onNotesChanged: (listener) => vaultChanged.listen(listener)
    }
  }
}

/**
 * Puts it where the renderer looks, and hands back the two signals.
 *
 * The caller needs them: one to drive a sync from, one for a sync to announce
 * on. `Shell.tsx` wires those to `startSync`.
 */
export function installBridge(): { localChanged: Signal; vaultChanged: Signal } {
  const localChanged = signal()
  const vaultChanged = signal()
  window.tova = webBridge(undefined, undefined, localChanged, vaultChanged)
  return { localChanged, vaultChanged }
}

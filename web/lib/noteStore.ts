/**
 * The web's half of `NoteStore`: notes in IndexedDB.
 *
 * The desktop's half is markdown files in a folder, and nothing above this line
 * knows which it is talking to. What lives here is plaintext — the cycle seals
 * on the way out and opens on the way in — so this is the one place in the web
 * client where a note is readable at rest, and it is readable only to the
 * origin that wrote it.
 *
 * That is a real cost and worth naming: a device holding a key and a cache can
 * be read by anything that gets script into this origin. `keyStore.ts` makes
 * the key unreadable; nothing can do the same for the notes, because the notes
 * are what the reader is here to see. "Forget this device" clears both.
 */

import { withVersion, type Versions } from "../../src/shared/backup"
import { database } from "./idb"
import type { AgreedNote, NoteStore, StoredNote } from "../../src/shared/noteStore"

const NOTES = "notes"
const AGREED = "agreed"
const META = "meta"
const VERSIONS = "versions"
const CURSOR = "cursor"
const STATE = "syncState"

/*
 * Every store named here, not per call. Whichever call opened the database
 * first would otherwise decide which stores exist, and every later call
 * wanting a different one would throw.
 */
const vault = database("tova-notes", [NOTES, AGREED, META, VERSIONS])

/** `bigint` survives structured clone, so a version is stored as it is. */
type StoredAgreed = AgreedNote

export function webNoteStore(): NoteStore {
  return {
    async all() {
      return vault.run<StoredNote[]>([NOTES], "readonly", ([notes]) => notes.getAll())
    },

    async write(note) {
      /*
       * The version before this one, kept.
       *
       * `docs/SYNC.md` leans on version history for the whole conflict story —
       * "a bad merge is recoverable because every version is kept" — and that
       * was true of the desktop, which keeps ten per note in `.versions`, and
       * of nothing else. A merge is written through here, so this is where the
       * text it replaced has to be caught.
       *
       * Read first, which costs a read on every write. A note is a few
       * kilobytes and a write is a keystroke's worth of consequence; losing
       * somebody's paragraph to a merge is not.
       */
      const before = await vault.run<StoredNote | undefined>([NOTES], "readonly", ([notes]) =>
        notes.get(note.id)
      )
      if (before !== undefined && before.text !== note.text) {
        await keepVersion(note.id, before.text)
      }

      await vault.run([NOTES], "readwrite", ([notes]) => notes.put(note, note.id))
    },

    async agreed() {
      const [keys, values] = await Promise.all([
        vault.run<IDBValidKey[]>([AGREED], "readonly", ([agreed]) => agreed.getAllKeys()),
        vault.run<StoredAgreed[]>([AGREED], "readonly", ([agreed]) => agreed.getAll())
      ])
      return Object.fromEntries(keys.map((key, at) => [String(key), values[at]]))
    },

    async agree(id, note) {
      await vault.run([AGREED], "readwrite", ([agreed]) => agreed.put(note, id))
    },

    async cursor() {
      const at = await vault.run<bigint | undefined>([META], "readonly", ([meta]) =>
        meta.get(CURSOR)
      )
      return at ?? 0n
    },

    async setCursor(at) {
      await vault.run([META], "readwrite", ([meta]) => meta.put(at, CURSOR))
    }
  }
}

/**
 * Keeps a version, named the way the desktop names them.
 *
 * A sortable timestamp and `.md`, so the same list and the same selection work
 * on either backend and the screen that shows them does not need to know which
 * it is talking to. `withVersion` is the policy; this is where it is kept.
 */
async function keepVersion(id: string, text: string): Promise<void> {
  const kept = withVersion((await versionsOf(id)) ?? {}, text, new Date())
  await vault.run([VERSIONS], "readwrite", ([versions]) => versions.put(kept, id))
}

const versionsOf = (id: string) =>
  vault.run<Versions | undefined>([VERSIONS], "readonly", ([versions]) => versions.get(id))

/** Newest first, the way the desktop lists them. */
export async function listVersions(id: string): Promise<string[]> {
  return Object.keys((await versionsOf(id)) ?? {}).sort((a, b) => b.localeCompare(a))
}

export async function readVersion(id: string, version: string): Promise<string> {
  const text = (await versionsOf(id))?.[version]
  if (text === undefined) throw new Error("There is no version by that name")
  return text
}

/**
 * The sync state, as `SyncApi` carries it.
 *
 * In this database rather than the settings one, so "forget this device"
 * clears it with everything else. A cursor left behind would be a cursor past
 * notes this browser no longer has, and the next sync would believe it was
 * caught up on a vault it had never read.
 */
export const readSyncState = (): Promise<unknown> =>
  vault.run<unknown>([META], "readonly", ([meta]) => meta.get(STATE))

export const writeSyncState = async (value: unknown): Promise<void> => {
  await vault.run([META], "readwrite", ([meta]) => meta.put(value, STATE))
}

/**
 * Everything this device is holding, gone.
 *
 * The other half of "forget this device": `keyStore.forget` drops the key and
 * this drops the notes it opened. Either alone leaves something behind — a key
 * with nothing to read, or readable notes with no key needed.
 */
export async function forgetNotes(): Promise<void> {
  await vault.forget()
}

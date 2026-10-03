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

import { database } from "./idb"
import type { AgreedNote, NoteStore, StoredNote } from "../../src/shared/noteStore"

const NOTES = "notes"
const AGREED = "agreed"
const META = "meta"
const CURSOR = "cursor"

/*
 * Every store named here, not per call. Whichever call opened the database
 * first would otherwise decide which stores exist, and every later call
 * wanting a different one would throw.
 */
const vault = database("tova-notes", [NOTES, AGREED, META])

/** `bigint` survives structured clone, so a version is stored as it is. */
type StoredAgreed = AgreedNote

export function webNoteStore(): NoteStore {
  return {
    async all() {
      return vault.run<StoredNote[]>([NOTES], "readonly", ([notes]) => notes.getAll())
    },

    async write(note) {
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
 * Everything this device is holding, gone.
 *
 * The other half of "forget this device": `keyStore.forget` drops the key and
 * this drops the notes it opened. Either alone leaves something behind — a key
 * with nothing to read, or readable notes with no key needed.
 */
export async function forgetNotes(): Promise<void> {
  await vault.forget()
}

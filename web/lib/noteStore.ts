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

import type { AgreedNote, NoteStore, StoredNote } from "../../src/shared/noteStore"

const DB = "tova-notes"
const NOTES = "notes"
const AGREED = "agreed"
const META = "meta"
const CURSOR = "cursor"

/** `bigint` survives structured clone, so a version is stored as it is. */
type StoredAgreed = AgreedNote

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of [NOTES, AGREED, META]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB would not open"))
  })
}

/** One transaction, resolved when it commits rather than when the request does. */
async function run<T>(
  names: string[],
  mode: IDBTransactionMode,
  work: (stores: IDBObjectStore[]) => IDBRequest<T>
): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(names, mode)
      const request = work(names.map((name) => transaction.objectStore(name)))
      // The transaction's success, not the request's: the request fires before
      // the write is durable and the transaction does not.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error("That write failed"))
      transaction.onabort = () => reject(transaction.error ?? new Error("That write was undone"))
    })
  } finally {
    db.close()
  }
}

export function webNoteStore(): NoteStore {
  return {
    async all() {
      return run<StoredNote[]>([NOTES], "readonly", ([notes]) => notes.getAll())
    },

    async write(note) {
      await run([NOTES], "readwrite", ([notes]) => notes.put(note, note.id))
    },

    async agreed() {
      const [keys, values] = await Promise.all([
        run<IDBValidKey[]>([AGREED], "readonly", ([agreed]) => agreed.getAllKeys()),
        run<StoredAgreed[]>([AGREED], "readonly", ([agreed]) => agreed.getAll())
      ])
      return Object.fromEntries(keys.map((key, at) => [String(key), values[at]]))
    },

    async agree(id, note) {
      await run([AGREED], "readwrite", ([agreed]) => agreed.put(note, id))
    },

    async cursor() {
      const at = await run<bigint | undefined>([META], "readonly", ([meta]) => meta.get(CURSOR))
      return at ?? 0n
    },

    async setCursor(at) {
      await run([META], "readwrite", ([meta]) => meta.put(at, CURSOR))
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
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("That database would not go"))
    // Another tab holding it open. The delete lands when that tab lets go, and
    // waiting forever here would hang a settings screen.
    request.onblocked = () => resolve()
  })
}

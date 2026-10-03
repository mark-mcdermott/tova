/**
 * The IndexedDB plumbing, once.
 *
 * Three stores need it now — the key, the notes, and the settings — and the
 * awkward parts are the same every time: a transaction resolves when it
 * commits rather than when its request succeeds, and a connection left open
 * blocks the next `deleteDatabase`.
 *
 * Nothing here knows what is being stored. Each caller names its own database
 * so that forgetting one does not take the others with it.
 */

export function openDb(name: string, stores: readonly string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB would not open"))
  })
}

/**
 * One transaction, closed afterwards.
 *
 * Resolved on `oncomplete`, not on the request's own success: the request
 * fires before the write is durable and the transaction does not. Closed in a
 * `finally`, because a connection still open is a connection that blocks
 * `deleteDatabase` — which is how "forget this device" would hang.
 */
export async function run<T>(
  name: string,
  stores: readonly string[],
  mode: IDBTransactionMode,
  work: (stores: IDBObjectStore[]) => IDBRequest<T>
): Promise<T> {
  const db = await openDb(name, stores)
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(stores as string[], mode)
      const request = work((stores as string[]).map((store) => transaction.objectStore(store)))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error("That write failed"))
      transaction.onabort = () => reject(transaction.error ?? new Error("That write was undone"))
    })
  } finally {
    db.close()
  }
}

/** Whether this browser can keep anything at all. Private windows sometimes cannot. */
export function available(): boolean {
  return typeof indexedDB !== "undefined"
}

/**
 * Removes a database entirely.
 *
 * `onblocked` resolves rather than waiting: another tab holding the database
 * open will let go eventually and the delete lands then, and hanging a
 * settings screen on that is worse than finishing a moment early.
 */
export function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("That database would not go"))
    request.onblocked = () => resolve()
  })
}

/**
 * The IndexedDB plumbing, once.
 *
 * Three stores need it — the key, the notes, and the settings — and the
 * awkward parts are the same every time: a transaction resolves when it
 * commits rather than when its request succeeds, and a connection left open
 * blocks the next `deleteDatabase`.
 *
 * A database is taken as a whole rather than a name and whichever stores one
 * call happens to want. That is not tidiness. `onupgradeneeded` fires once, so
 * whichever call opened the database first would decide which stores exist —
 * and every later call naming a different one would throw `object stores was
 * not found`, in the browser, where no test here can see it. It did.
 */

export interface Database {
  run: <T>(
    within: readonly string[],
    mode: IDBTransactionMode,
    work: (stores: IDBObjectStore[]) => IDBRequest<T>
  ) => Promise<T>
  forget: () => Promise<void>
}

/** Whether this browser can keep anything at all. Private windows sometimes cannot. */
export function available(): boolean {
  return typeof indexedDB !== "undefined"
}

/**
 * One database, with every store it will ever have named up front.
 *
 * `stores` is the whole list, always, whatever a given call is about to touch.
 */
export function database(name: string, stores: readonly string[]): Database {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
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

  return {
    /**
     * One transaction, closed afterwards.
     *
     * Resolved on `oncomplete`, not on the request's own success: the request
     * fires before the write is durable and the transaction does not. Closed
     * in a `finally`, because a connection still open blocks `deleteDatabase`
     * — which is how "forget this device" would hang.
     */
    async run<T>(
      within: readonly string[],
      mode: IDBTransactionMode,
      work: (stores: IDBObjectStore[]) => IDBRequest<T>
    ): Promise<T> {
      const db = await open()
      try {
        return await new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(within as string[], mode)
          const request = work((within as string[]).map((one) => transaction.objectStore(one)))
          transaction.oncomplete = () => resolve(request.result)
          transaction.onerror = () => reject(transaction.error ?? new Error("That write failed"))
          transaction.onabort = () =>
            reject(transaction.error ?? new Error("That write was undone"))
        })
      } finally {
        db.close()
      }
    },

    /**
     * Removes it entirely.
     *
     * `onblocked` resolves rather than waiting: another tab holding it open
     * will let go eventually and the delete lands then, and hanging a settings
     * screen on that is worse than finishing a moment early.
     */
    forget() {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error ?? new Error("That database would not go"))
        request.onblocked = () => resolve()
      })
    }
  }
}

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
  const openAt = (version?: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const store of stores) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("IndexedDB would not open"))
    })

  /**
   * Opens it, adding any store that is not there yet.
   *
   * `onupgradeneeded` fires only when the version goes up, so a database made
   * before a store was added would never get it — not for the person who added
   * it, and not for anybody already running the app. Opening with no version
   * asks what the current one is; a store missing from it means reopening one
   * higher, which is what runs the upgrade.
   *
   * Derived rather than a number kept by hand, because a number kept by hand
   * is a number somebody forgets to raise, and the failure is a store that is
   * not found — in a browser, where no test here can see it. Twice now.
   */
  const open = async (): Promise<IDBDatabase> => {
    const existing = await openAt()
    if (stores.every((store) => existing.objectStoreNames.contains(store))) return existing

    const at = existing.version
    existing.close()
    return openAt(at + 1)
  }

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

/**
 * Where the content key lives between page loads.
 *
 * As a non-extractable `CryptoKey` in IndexedDB, which is the one place a
 * browser can hold key material that script can use and cannot read. WebCrypto
 * imports the bytes, marks them unexportable, and IndexedDB stores that object
 * as it is — so `crypto.subtle.exportKey` on what comes back throws, and there
 * is nothing for an attacker to exfiltrate.
 *
 * The residual risk is exact and worth writing down rather than implying away:
 * an XSS hole in the web app could decrypt notes *in that session* without ever
 * holding the key. The editor renders what the reader wrote, so that surface is
 * the one that matters, and `forget` is what makes the risk end rather than
 * persist. `docs/SYNC.md` has the fuller version, including the stricter
 * fallback — in memory only, password every session — if that surface ever
 * looks shaky.
 */

const DB = "tova"
const STORE = "keys"
const CONTENT = "content"

type Stored = { key: CryptoKey; epoch: number }

/**
 * A key that can be used and not read.
 *
 * Both usages, because a vault is written to as well as read from and one key
 * serves both. `false` is the whole point of the file.
 */
export async function unexportable(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"])
}

/** Whether this browser can keep a key at all. Private windows sometimes cannot. */
export function available(): boolean {
  return typeof indexedDB !== "undefined"
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB would not open"))
  })
}

/** One transaction, resolved when it commits rather than when the request does. */
async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      // The request's own success fires before the write is durable; the
      // transaction's does not, which is the one worth waiting for.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error("That write failed"))
      transaction.onabort = () => reject(transaction.error ?? new Error("That write was undone"))
    })
  } finally {
    db.close()
  }
}

/**
 * Keeps the content key on this device, in a form it cannot be read out of.
 *
 * The bytes are imported and then dropped. What is stored is the `CryptoKey`,
 * never the `Uint8Array` — storing the array would put the key itself in
 * IndexedDB in the clear, which is the exact thing this file exists to avoid.
 */
export async function remember(contentKey: Uint8Array<ArrayBuffer>, epoch: number): Promise<void> {
  const key = await unexportable(contentKey)
  await run("readwrite", (store) => store.put({ key, epoch } satisfies Stored, CONTENT))
}

/**
 * Keeps the key if this browser can, and reports whether it did.
 *
 * Off unless the reader asks. Writing a decryption key to disk is a cost they
 * should consent to — the same rule that keeps the grammar dictionary and the
 * update check off until somebody says otherwise — so the sign-in form has an
 * unticked box and this is what it calls. A browser that cannot store one at
 * all says so rather than throwing: a private window is not an error.
 */
export async function keepIfPossible(vault: {
  contentKey: Uint8Array<ArrayBuffer>
  epoch: number
}): Promise<boolean> {
  if (!available()) return false
  try {
    await remember(vault.contentKey, vault.epoch)
    return true
  } catch {
    // Blocked site data, a full quota, a private window that pretends. None of
    // them is worth failing a sign-in over; the vault is open either way.
    return false
  }
}

/** The key this device is holding, or null. */
export async function recall(): Promise<Stored | null> {
  const found = await run<Stored | undefined>("readonly", (store) => store.get(CONTENT))
  return found ?? null
}

/**
 * Forget this device.
 *
 * The end of the XSS window above, and the only thing that ends it. Signing out
 * does not: a session is an auth question, and it cannot reach back and lock a
 * key a device already holds.
 */
export async function forget(): Promise<void> {
  await run("readwrite", (store) => store.delete(CONTENT))
}

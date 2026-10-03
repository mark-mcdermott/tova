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

import { available, run } from "./idb"

export { available }

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

/**
 * Keeps the content key on this device, in a form it cannot be read out of.
 *
 * The bytes are imported and then dropped. What is stored is the `CryptoKey`,
 * never the `Uint8Array` — storing the array would put the key itself in
 * IndexedDB in the clear, which is the exact thing this file exists to avoid.
 */
export async function remember(contentKey: Uint8Array<ArrayBuffer>, epoch: number): Promise<void> {
  const key = await unexportable(contentKey)
  await run(DB, [STORE], "readwrite", ([keys]) =>
    keys.put({ key, epoch } satisfies Stored, CONTENT)
  )
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
  const found = await run<Stored | undefined>(DB, [STORE], "readonly", ([keys]) =>
    keys.get(CONTENT)
  )
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
  await run(DB, [STORE], "readwrite", ([keys]) => keys.delete(CONTENT))
}

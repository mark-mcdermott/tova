import { readdir, readFile, writeFile } from "fs/promises"
import { join } from "path"
import { looksEncrypted, seal, unseal } from "./crypto"
import { vaultRoot } from "./vault"
import { createVaultKey, isVaultEncrypted, keyFor, removeVaultKey } from "./vaultKeys"

/**
 * Every read and write of a file inside the vault goes through here.
 *
 * One pair of functions rather than a rule everyone has to remember: a note
 * saved down some path that skipped the encryption would sit in plain sight
 * inside a vault the reader believes is closed, and nothing would say so.
 */

/** Files that are the vault's own bookkeeping, and are never encrypted. */
const PLAIN = new Set([".tova-vault", ".DS_Store"])

class LockedVaultError extends Error {
  constructor() {
    super("This vault is encrypted and has not been unlocked")
  }
}

export async function readVaultBytes(path: string): Promise<Buffer> {
  const raw = await readFile(path)
  const text = raw.subarray(0, 64).toString("utf-8")
  if (!looksEncrypted(text)) return raw

  const key = keyFor(vaultRoot())
  if (key === null) throw new LockedVaultError()
  return unseal(raw.toString("utf-8"), key)
}

export async function readVaultText(path: string): Promise<string> {
  return (await readVaultBytes(path)).toString("utf-8")
}

export async function writeVaultBytes(path: string, bytes: Uint8Array): Promise<void> {
  const root = vaultRoot()
  if (!(await isVaultEncrypted(root))) {
    await writeFile(path, bytes)
    return
  }

  const key = keyFor(root)
  if (key === null) throw new LockedVaultError()
  await writeFile(path, seal(Buffer.from(bytes), key), "utf-8")
}

export async function writeVaultText(path: string, text: string): Promise<void> {
  await writeVaultBytes(path, Buffer.from(text, "utf-8"))
}

/** Every file under the vault, bookkeeping aside. */
async function vaultFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const found: string[] = []

  for (const entry of entries) {
    if (PLAIN.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await vaultFiles(path)))
    else if (entry.isFile()) found.push(path)
  }

  return found
}

/**
 * Turns a plain vault into an encrypted one, and hands back the recovery key.
 *
 * Run over a vault that is already sealed it finishes the job instead, sealing
 * whatever is still plain with the key that is already there. A conversion
 * stopped halfway — a crash, a laptop lid — otherwise leaves a vault that says
 * it is encrypted and holds notes that are not, with no way left to say so.
 * Nothing comes back in that case: the recovery key was handed over the first
 * time and is not ours to hand over twice.
 */
export async function encryptVault(root: string): Promise<string | null> {
  const existing = await isVaultEncrypted(root)
  if (existing && keyFor(root) === null) throw new LockedVaultError()

  const files = await vaultFiles(root)
  const opened = existing
    ? { key: keyFor(root) as Buffer, recoveryKey: null }
    : await createVaultKey(root)

  for (const path of files) {
    const raw = await readFile(path)
    if (looksEncrypted(raw.subarray(0, 64).toString("utf-8"))) continue
    await writeFile(path, seal(raw, opened.key), "utf-8")
  }

  return opened.recoveryKey
}

/** Turns it back, which needs the key it is being asked to stop using. */
export async function decryptVault(root: string): Promise<void> {
  if (!(await isVaultEncrypted(root))) throw new Error("That vault is not encrypted")

  const key = keyFor(root)
  if (key === null) throw new LockedVaultError()

  for (const path of await vaultFiles(root)) {
    const raw = await readFile(path)
    if (!looksEncrypted(raw.subarray(0, 64).toString("utf-8"))) continue
    await writeFile(path, unseal(raw.toString("utf-8"), key))
  }

  // Last, so an interrupted run leaves a vault that still knows its own key.
  await removeVaultKey(root)
}

import { app, safeStorage } from "electron"
import { readFile, writeFile, rm } from "fs/promises"
import { join } from "path"
import {
  KEY_BYTES,
  newKey,
  newRecoveryKey,
  newSalt,
  recoveryKeyToCipherKey,
  seal,
  unseal
} from "./crypto"

/**
 * The file that says a vault is encrypted, kept in the vault itself.
 *
 * In the vault rather than in preferences, because the vault is the thing that
 * travels: a folder synced to another machine arrives knowing what it is, and
 * carrying the one copy of its key that a recovery key can open.
 */
const MARKER = ".tova-vault"

interface VaultMarker {
  version: 1
  /** The vault key, wrapped by what was written down. */
  recovery: { salt: string; envelope: string }
}

function markerPath(root: string): string {
  return join(root, MARKER)
}

/** Keys this machine can open without being asked, wrapped by the keychain. */
function keyStorePath(): string {
  return join(app.getPath("userData"), "vault-keys.json")
}

async function readMarker(root: string): Promise<VaultMarker | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(markerPath(root), "utf-8"))
    if (typeof parsed !== "object" || parsed === null) return null
    const marker = parsed as VaultMarker
    return marker.recovery === undefined ? null : marker
  } catch {
    return null
  }
}

export async function isVaultEncrypted(root: string): Promise<boolean> {
  return (await readMarker(root)) !== null
}

async function readKeyStore(): Promise<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(keyStorePath(), "utf-8"))
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/**
 * Remembers a key so this machine need not ask again. Wrapped by the OS
 * keychain, which is what makes it safe to keep beside the app rather than in
 * the vault — a stolen folder carries no key this file could give up.
 */
async function rememberKey(root: string, key: Buffer): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) return

  const store = await readKeyStore()
  store[root] = safeStorage.encryptString(key.toString("base64")).toString("base64")
  await writeFile(keyStorePath(), JSON.stringify(store, null, 2), "utf-8")
}

async function forgetKey(root: string): Promise<void> {
  const store = await readKeyStore()
  delete store[root]
  await writeFile(keyStorePath(), JSON.stringify(store, null, 2), "utf-8")
}

async function rememberedKey(root: string): Promise<Buffer | null> {
  const stored = (await readKeyStore())[root]
  if (stored === undefined || !safeStorage.isEncryptionAvailable()) return null

  try {
    const key = Buffer.from(safeStorage.decryptString(Buffer.from(stored, "base64")), "base64")
    return key.length === KEY_BYTES ? key : null
  } catch {
    // A keychain that changed underneath us. The recovery key is the way back.
    return null
  }
}

/*
 * Keys held for this run, by vault. In memory only: quitting locks every vault
 * that this machine could not open on its own anyway.
 */
const unlocked = new Map<string, Buffer>()

export function keyFor(root: string): Buffer | null {
  return unlocked.get(root) ?? null
}

export function lockVault(root: string): void {
  unlocked.delete(root)
}

/** Opens a vault with the key this machine remembers, if it remembers one. */
export async function unlockVault(root: string): Promise<boolean> {
  if (unlocked.has(root)) return true
  if (!(await isVaultEncrypted(root))) return true

  const key = await rememberedKey(root)
  if (key === null) return false

  unlocked.set(root, key)
  return true
}

/**
 * Opens a vault with what was written down, and remembers it afterwards so it
 * is asked for once per machine rather than once per launch.
 */
export async function unlockWithRecoveryKey(root: string, recoveryKey: string): Promise<boolean> {
  const marker = await readMarker(root)
  if (marker === null) return false

  try {
    const salt = Buffer.from(marker.recovery.salt, "base64")
    const wrapping = await recoveryKeyToCipherKey(recoveryKey, salt)
    const key = unseal(marker.recovery.envelope, wrapping)
    if (key.length !== KEY_BYTES) return false

    unlocked.set(root, key)
    await rememberKey(root, key)
    return true
  } catch {
    // The wrong key, or a marker that has been edited. Either way, no.
    return false
  }
}

/**
 * Gives a vault a key and writes down the one way back to it. The recovery key
 * is returned once and never stored in the clear — losing it and the keychain
 * together means losing the notes, which is the bargain encryption makes.
 */
export async function createVaultKey(root: string): Promise<{ key: Buffer; recoveryKey: string }> {
  const key = newKey()
  const recoveryKey = newRecoveryKey()
  const salt = newSalt()
  const wrapping = await recoveryKeyToCipherKey(recoveryKey, salt)

  const marker: VaultMarker = {
    version: 1,
    recovery: { salt: salt.toString("base64"), envelope: seal(key, wrapping) }
  }
  await writeFile(markerPath(root), JSON.stringify(marker, null, 2), "utf-8")
  await rememberKey(root, key)
  unlocked.set(root, key)

  return { key, recoveryKey }
}

/** Takes the key away once the files no longer need it. */
export async function removeVaultKey(root: string): Promise<void> {
  await rm(markerPath(root), { force: true })
  await forgetKey(root)
  unlocked.delete(root)
}

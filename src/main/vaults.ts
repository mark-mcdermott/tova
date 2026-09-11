import { dialog } from "electron"
import { mkdir, readdir } from "fs/promises"
import { basename } from "path"
import { defaultVaultRoot, ensureVault, setActiveVault } from "./vault"
import { decryptVault as unsealVault, encryptVault as sealVault } from "./vaultFile"
import { isVaultEncrypted, unlockVault as openVault, unlockWithRecoveryKey } from "./vaultKeys"
import { readPreferences, writePreferences } from "./preferences"

export interface VaultChoice {
  path: string
  name: string
  active: boolean
  encrypted: boolean
  locked: boolean
}

/**
 * Every vault the reader has, the default one always among them. The default
 * is not stored — it is where a vault lives when nobody has said otherwise, and
 * writing it down would only let it go stale if the home directory moved.
 */
export async function listVaults(): Promise<VaultChoice[]> {
  const { vaults, activeVault } = await readPreferences()
  const paths = [defaultVaultRoot(), ...vaults.filter((path) => path !== defaultVaultRoot())]

  return Promise.all(
    paths.map(async (path) => {
      const encrypted = await isVaultEncrypted(path)
      return {
        path,
        name: basename(path),
        active: path === (activeVault ?? defaultVaultRoot()),
        encrypted,
        // Asked rather than assumed: unlocking is what says whether this
        // machine's keychain still holds the key.
        locked: encrypted && !(await openVault(path))
      }
    })
  )
}

/** Switches, creating the section directories the new vault may not have yet. */
export async function useVault(path: string): Promise<VaultChoice[]> {
  const preferences = await readPreferences()
  const known = [defaultVaultRoot(), ...preferences.vaults]
  if (!known.includes(path)) throw new Error("That is not one of your vaults")

  setActiveVault(path === defaultVaultRoot() ? null : path)
  // Before anything reads from it, so a sealed vault opens rather than looking
  // like a folder full of gibberish.
  await openVault(path)
  await ensureVault()
  await writePreferences({
    ...preferences,
    activeVault: path === defaultVaultRoot() ? null : path
  })

  return listVaults()
}

/** Adds a directory as a vault and switches to it. */
export async function addVault(): Promise<VaultChoice[]> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Choose a folder for the vault",
    properties: ["openDirectory", "createDirectory"]
  })

  const chosen = filePaths[0]
  if (canceled || chosen === undefined) return listVaults()

  await mkdir(chosen, { recursive: true })

  const preferences = await readPreferences()
  if (!preferences.vaults.includes(chosen) && chosen !== defaultVaultRoot()) {
    await writePreferences({ ...preferences, vaults: [...preferences.vaults, chosen] })
  }

  return useVault(chosen)
}

/**
 * Forgets a vault. The directory and everything in it stays exactly where it
 * is — Tova stops listing it, and nothing else. Removing the one in use falls
 * back to the default rather than leaving nothing open.
 */
export async function forgetVault(path: string): Promise<VaultChoice[]> {
  if (path === defaultVaultRoot()) throw new Error("The default vault cannot be removed")

  const preferences = await readPreferences()
  await writePreferences({
    ...preferences,
    vaults: preferences.vaults.filter((vault) => vault !== path),
    activeVault: preferences.activeVault === path ? null : preferences.activeVault
  })

  if (preferences.activeVault === path) {
    setActiveVault(null)
    await ensureVault()
  }

  return listVaults()
}

/** Whether a directory already holds a vault, so the UI can say which is which. */
export async function looksLikeVault(path: string): Promise<boolean> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  return entries.some((entry) => entry.isDirectory() && entry.name === "notes")
}

/** Seals the vault, handing back the one way in that is not this machine. */
export async function encryptVault(path: string): Promise<string> {
  await assertKnown(path)
  if (await isVaultEncrypted(path)) throw new Error("That vault is already encrypted")

  const recoveryKey = await sealVault(path)
  if (recoveryKey === null) throw new Error("That vault is already encrypted")
  return recoveryKey
}

export async function decryptVault(path: string): Promise<VaultChoice[]> {
  await assertKnown(path)
  await unsealVault(path)
  return listVaults()
}

export async function unlockVault(path: string, recoveryKey: string): Promise<boolean> {
  await assertKnown(path)
  return unlockWithRecoveryKey(path, recoveryKey)
}

/** The renderer names a path; only one of the reader's own is ever acted on. */
async function assertKnown(path: string): Promise<void> {
  const { vaults } = await readPreferences()
  if (![defaultVaultRoot(), ...vaults].includes(path)) {
    throw new Error("That is not one of your vaults")
  }
}

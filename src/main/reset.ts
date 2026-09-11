import { app } from "electron"
import { homedir } from "os"
import { join, resolve, sep } from "path"
import { rm } from "fs/promises"
import { DEFAULT_PREFERENCES } from "../shared/preferences"
import { readPreferences, writePreferences } from "./preferences"
import { defaultVaultRoot, ensureVault, setActiveVault } from "./vault"

/**
 * Everything Tova keeps about a reader, by name. Enumerated rather than the
 * whole of userData: Chromium keeps its own state in there, and pulling that
 * out from under a running app is a different and worse kind of reset.
 */
const APP_FILES = [
  "preferences.json",
  "session.json",
  "window.json",
  "blogs.json",
  "publish-timing.json",
  "blog-sync.json",
  "avatar.jpg",
  "avatar.jpeg",
  "avatar.png",
  "avatar.webp"
]

const APP_FOLDERS = ["fonts", "backgrounds"]

/**
 * Preferences back to what a fresh install has, and the default vault back in
 * use. The notes are not touched — a vault that is forgotten here is still a
 * folder full of files, and adding it again brings it back.
 */
export async function resetPreferences(): Promise<void> {
  await writePreferences(DEFAULT_PREFERENCES)
  setActiveVault(null)
  await ensureVault()
}

/**
 * A path Tova is willing to delete outright.
 *
 * A vault is a folder the reader chose, and some of them choose badly — a home
 * directory, or the whole of Documents. Deleting one of those because it was
 * once added as a vault is not something to find out about afterwards, so
 * anything at or above the home directory is refused.
 */
function safeToDelete(path: string): boolean {
  const target = resolve(path)
  const home = resolve(homedir())
  if (target === home || home.startsWith(target + sep)) return false
  // Two segments below the root at the very least, so "/" and "/Users" go too.
  return target.split(sep).filter((part) => part !== "").length >= 2
}

/** Every vault Tova knows of, the default one included. */
async function vaultRoots(): Promise<string[]> {
  const { vaults } = await readPreferences()
  return [...new Set([defaultVaultRoot(), ...vaults])]
}

/** What a nuke would delete, so the confirm can name it rather than gesture. */
export async function nukeTargets(): Promise<string[]> {
  return [...(await vaultRoots()).filter(safeToDelete), app.getPath("userData")]
}

/**
 * Every note in every vault, and everything Tova stores about the reader —
 * settings, session, the pictures and faces they added, and the blog tokens,
 * which are ciphertext inside blogs.json and go with it.
 *
 * The app relaunches rather than carrying on: every path it holds open has
 * just been deleted underneath it, and a fresh start is the honest next state.
 */
export async function nukeEverything(): Promise<void> {
  for (const root of await vaultRoots()) {
    if (safeToDelete(root)) await rm(root, { recursive: true, force: true })
  }

  const userData = app.getPath("userData")
  for (const name of [...APP_FILES, ...APP_FOLDERS]) {
    await rm(join(userData, name), { recursive: true, force: true })
  }

  app.relaunch()
  app.exit(0)
}

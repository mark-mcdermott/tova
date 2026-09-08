import { app } from "electron"
import { userInfo } from "os"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { Preferences, normalizePreferences } from "../shared/preferences"

function pathToPreferences(): string {
  return join(app.getPath("userData"), "preferences.json")
}

/**
 * The account name, as a starting point for the sidebar's display name. Only
 * ever a seed: it is written into preferences on first read and is an ordinary
 * editable value from then on, so clearing the field really does clear it.
 */
function accountName(): string {
  try {
    return userInfo().username
  } catch {
    // No account to ask about — a sandbox, or a user id with no passwd entry.
    return ""
  }
}

export async function readPreferences(): Promise<Preferences> {
  try {
    return normalizePreferences(JSON.parse(await readFile(pathToPreferences(), "utf-8")))
  } catch {
    // Nothing stored yet. Seed the name and picture from the account rather
    // than starting blank, and write them so they are editable like any other.
    const { seedAvatar } = await import("./avatar")
    return writePreferences({
      ...normalizePreferences(null),
      displayName: accountName(),
      avatarFile: await seedAvatar()
    })
  }
}

export async function writePreferences(value: unknown): Promise<Preferences> {
  const preferences = normalizePreferences(value)
  const path = pathToPreferences()

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(preferences, null, 2), "utf-8")
  return preferences
}

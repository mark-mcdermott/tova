import { app } from "electron"
import { userInfo } from "os"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { Preferences, normalizePreferences } from "../shared/preferences"

function pathToPreferences(): string {
  return join(app.getPath("userData"), "preferences.json")
}

/**
 * The account name, for the sidebar to show where the reader asks it to. Read
 * where it lives rather than copied into preferences, so renaming the account
 * renames it here.
 */
export function accountName(): string {
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
    // Nothing stored yet. Start on the account's own name and picture rather
    // than blank, which is a choice like any other and can be changed.
    const { startingAvatar } = await import("./avatar")
    return writePreferences({
      ...normalizePreferences(null),
      displayNameSource: accountName() === "" ? "none" : "system",
      avatar: await startingAvatar()
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

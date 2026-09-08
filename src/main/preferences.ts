import { app } from "electron"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { Preferences, normalizePreferences } from "../shared/preferences"

function pathToPreferences(): string {
  return join(app.getPath("userData"), "preferences.json")
}

export async function readPreferences(): Promise<Preferences> {
  try {
    return normalizePreferences(JSON.parse(await readFile(pathToPreferences(), "utf-8")))
  } catch {
    // No file yet, or one that cannot be parsed — the defaults are correct.
    return normalizePreferences(null)
  }
}

export async function writePreferences(value: unknown): Promise<Preferences> {
  const preferences = normalizePreferences(value)
  const path = pathToPreferences()

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(preferences, null, 2), "utf-8")
  return preferences
}

import { app } from "electron"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { Screen, normalizeScreen } from "../shared/screen"

/*
 * Where the reader was when the app last had their attention.
 *
 * Written on every move rather than on quit, which the window's own state does.
 * A frame only matters as it was left, so losing it to a crash costs nothing;
 * losing your place does, and a crash is exactly when you have not had the
 * chance to leave tidily.
 *
 * It is not a preference. Preferences are chosen and this is only observed, so
 * it lives in its own file and clearing it changes nothing the reader asked for.
 */

function pathToSession(): string {
  return join(app.getPath("userData"), "session.json")
}

export async function readSession(): Promise<Screen | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(pathToSession(), "utf-8"))
    if (typeof parsed !== "object" || parsed === null) return null
    return normalizeScreen((parsed as { screen?: unknown }).screen)
  } catch {
    // No file yet, or one that cannot be read. Either way there is nowhere to
    // return to, which is the same answer as a first launch.
    return null
  }
}

export async function writeSession(value: unknown): Promise<void> {
  const screen = normalizeScreen(value)
  if (screen === null) return

  const path = pathToSession()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ screen }, null, 2), "utf-8")
}

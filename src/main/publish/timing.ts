import { app } from "electron"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { averageDuration, recordDuration } from "../../shared/publishProgress"

/** How long this blog's builds have been taking, so the bar can be honest. */
type History = Record<string, number[]>

function pathToHistory(): string {
  return join(app.getPath("userData"), "publish-timing.json")
}

async function load(): Promise<History> {
  try {
    const parsed: unknown = JSON.parse(await readFile(pathToHistory(), "utf-8"))
    return typeof parsed === "object" && parsed !== null ? (parsed as History) : {}
  } catch {
    return {}
  }
}

export async function averageFor(blogId: string): Promise<number | null> {
  const history = await load()
  return averageDuration(history[blogId] ?? [])
}

export async function remember(blogId: string, durationMs: number): Promise<void> {
  const history = await load()
  history[blogId] = recordDuration(history[blogId] ?? [], durationMs)

  const path = pathToHistory()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(history, null, 2), "utf-8")
}

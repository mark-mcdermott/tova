import { readdir } from "fs/promises"
import { Note } from "../shared/types"
import {
  toDailyNoteName,
  parseDailyNoteName,
  formatDailyTitle,
  isBlankDailyBody,
  msUntilNextMidnight
} from "../shared/date"
import { toNoteId } from "../shared/noteLocation"
import { resolveInVault } from "./vault"
import { readNote, createNote, deleteNoteFile } from "./notes"

function dailyId(date: Date): string {
  return toNoteId({ section: "daily", folder: null, filename: `${toDailyNoteName(date)}.md` })
}

/** Today's daily note, created with an `M/D/YY` title if it does not exist. */
export async function ensureDailyNote(date = new Date()): Promise<Note> {
  const id = dailyId(date)

  const existing = await readNote(id).catch(() => null)
  if (existing !== null) return existing

  return createNote({
    section: "daily",
    title: formatDailyTitle(date),
    filename: `${toDailyNoteName(date)}.md`
  })
}

/**
 * Removes past daily notes that were never written in. Today's note is never
 * touched, and neither is anything the user actually typed into.
 */
export async function cleanupBlankDailyNotes(now = new Date()): Promise<string[]> {
  const entries = await readdir(resolveInVault("daily")).catch(() => [] as string[])
  const today = toDailyNoteName(now)
  const removed: string[] = []

  for (const filename of entries) {
    const date = parseDailyNoteName(filename)
    if (date === null) continue
    if (toDailyNoteName(date) >= today) continue

    const id = toNoteId({ section: "daily", folder: null, filename })
    const note = await readNote(id).catch(() => null)
    if (note === null) continue
    if (!isBlankDailyBody(note.body, note.title)) continue

    // Deleted outright rather than trashed: an empty auto-generated note is
    // not something anyone wants to find in Trash. Launch backs up first.
    // Errors propagate — a sweep that quietly fails is worse than a loud one.
    await deleteNoteFile(id)
    removed.push(id)
  }

  return removed
}

/**
 * Creates the next day's note just after midnight, then re-arms. The file is
 * only created — it is deliberately not loaded into the editor, which fixes
 * the Xin bug where tomorrow's note did not exist until the app restarted.
 */
export function startDailyNoteSchedule(
  onError: (error: unknown) => void = () => undefined
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const arm = (): void => {
    timer = setTimeout(() => {
      ensureDailyNote().catch(onError).finally(arm)
    }, msUntilNextMidnight(new Date()))
  }

  arm()

  return () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
}

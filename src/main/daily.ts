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

async function ensureDaily(date: Date): Promise<{ note: Note; created: boolean }> {
  const id = dailyId(date)

  const existing = await readNote(id).catch(() => null)
  if (existing !== null) return { note: existing, created: false }

  const note = await createNote({
    section: "daily",
    title: formatDailyTitle(date),
    filename: `${toDailyNoteName(date)}.md`
  })
  return { note, created: true }
}

/** Today's daily note, created with an `M/D/YY` title if it does not exist. */
export async function ensureDailyNote(date = new Date()): Promise<Note> {
  return (await ensureDaily(date)).note
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

export interface DailyNoteSchedule {
  /**
   * Re-check immediately — for wake from sleep, or the app regaining focus.
   * Resolves once the check settles, so callers can await it.
   */
  refresh: () => Promise<void>
  stop: () => void
}

interface ScheduleOptions {
  /** Fired only when a note was actually written, not on every check. */
  onCreated?: (note: Note) => void
  onError?: (error: unknown) => void
}

/**
 * Keeps today's daily note in existence. The file is only created — it is never
 * loaded into the editor, which fixes the Xin bug where tomorrow's note did not
 * exist until the app restarted.
 *
 * A midnight timer alone is not enough: Chromium throttles background timers,
 * and a timeout armed before the machine sleeps does not fire on time (or at
 * all) across a suspend. So the same check also runs on wake and on focus, and
 * the timer is re-armed from the current clock each time rather than trusted.
 */
export function startDailyNoteSchedule(options: ScheduleOptions = {}): DailyNoteSchedule {
  const { onCreated, onError = () => undefined } = options

  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let ensuredFor: string | null = null
  let stopped = false

  const check = async (): Promise<void> => {
    const today = toDailyNoteName(new Date())

    // Focus fires constantly, and a note the user deliberately trashed should
    // not spring back on every click into the window. One check per date.
    if (ensuredFor === today) return

    const { note, created } = await ensureDaily(new Date())
    ensuredFor = today
    if (created) onCreated?.(note)
  }

  const run = (): Promise<void> => {
    // Wake and focus usually arrive together; coalesce so they cannot race
    // each other into creating the same file twice.
    if (inFlight === null) {
      inFlight = check()
        .catch(onError)
        .finally(() => {
          inFlight = null
        })
    }
    return inFlight
  }

  const arm = (): void => {
    if (stopped) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      void run().finally(arm)
    }, msUntilNextMidnight(new Date()))
  }

  arm()

  return {
    refresh: () => run().finally(arm),
    stop: () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}

import { padTwo } from "./date"

export const DEFAULT_BACKUP_LIMIT = 30
export const DEFAULT_VERSION_LIMIT = 10

/**
 * Autosave fires constantly; versions are only worth keeping this far apart.
 *
 * The same five minutes the desktop uses, and not only for tidiness: a version
 * is named by the second it was taken, so two inside one second would be one
 * name and the second would land on top of the first. Ten versions would
 * quietly mean ten distinct seconds.
 */
export const VERSION_INTERVAL_MS = 5 * 60 * 1000

const BACKUP_NAME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/

/**
 * Dated folder name for one backup. Local time and a lexically sortable shape,
 * so sorting names chronologically needs no parsing.
 */
export function backupFolderName(date: Date): string {
  const day = `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`
  const time = `${padTwo(date.getHours())}-${padTwo(date.getMinutes())}-${padTwo(date.getSeconds())}`
  return `${day}_${time}`
}

export function parseBackupFolderName(name: string): Date | null {
  const match = BACKUP_NAME.exec(name)
  if (!match) return null

  const [, year, month, day, hour, minute, second] = match.map(Number) as unknown as number[]
  const date = new Date(year, month - 1, day, hour, minute, second)
  return backupFolderName(date) === name ? date : null
}

/** Newest first. Entries that are not backup folders are dropped. */
export function sortBackups(names: string[]): string[] {
  return names
    .filter((name) => parseBackupFolderName(name) !== null)
    .sort((a, b) => b.localeCompare(a))
}

/** The backups beyond `keep` that should be pruned, oldest included first. */
export function selectExpiredBackups(names: string[], keep = DEFAULT_BACKUP_LIMIT): string[] {
  if (keep < 0) throw new Error("keep must not be negative")
  return sortBackups(names).slice(keep)
}

/**
 * Flattens a note id into a single directory name, since ids contain slashes.
 * `notes/ideas/river.md` becomes `notes__ideas__river.md`.
 */
export function versionKey(noteId: string): string {
  return noteId.replace(/\//g, "__")
}

export function versionFileName(date: Date): string {
  return `${backupFolderName(date)}.md`
}

/** Versions past `keep`, oldest first — same lexical ordering as backups. */
/** The versions a note keeps, newest name first. */
export type Versions = Record<string, string>

/**
 * The versions after one more, with the oldest dropped.
 *
 * The whole policy, as a function rather than as steps inside a write. What
 * `docs/SYNC.md` leans on for the conflict story is that a bad merge is
 * recoverable, and that is only true if the text being replaced is caught
 * before it goes — so this is given the old text and decides whether it was
 * worth keeping.
 */
export function withVersion(
  held: Versions,
  replaced: string,
  at: Date,
  keep = DEFAULT_VERSION_LIMIT
): Versions {
  // Nothing to recover from an empty note, and keeping one would push a real
  // version out of a list that only holds ten.
  if (replaced === "") return held

  /*
   * Not if the last one is recent. A burst of typing is one version — the
   * text as it stood before the burst — rather than ten of the same minute,
   * which is what a list of ten would otherwise fill up with.
   */
  const newest = Object.keys(held).sort((a, b) => b.localeCompare(a))[0]
  const taken = newest === undefined ? null : parseBackupFolderName(newest.replace(/\.md$/, ""))
  if (taken !== null && at.getTime() - taken.getTime() < VERSION_INTERVAL_MS) return held

  const kept: Versions = { ...held, [versionFileName(at)]: replaced }
  for (const expired of selectExpiredVersions(Object.keys(kept), keep)) delete kept[expired]
  return kept
}

export function selectExpiredVersions(names: string[], keep = DEFAULT_VERSION_LIMIT): string[] {
  const versions = names.filter((name) => name.endsWith(".md")).sort((a, b) => b.localeCompare(a))
  return versions.slice(keep)
}

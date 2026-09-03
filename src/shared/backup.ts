import { padTwo } from "./date"

export const DEFAULT_BACKUP_LIMIT = 30
export const DEFAULT_VERSION_LIMIT = 10

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
  return names.filter((name) => parseBackupFolderName(name) !== null).sort((a, b) => b.localeCompare(a))
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
export function selectExpiredVersions(names: string[], keep = DEFAULT_VERSION_LIMIT): string[] {
  const versions = names.filter((name) => name.endsWith(".md")).sort((a, b) => b.localeCompare(a))
  return versions.slice(keep)
}

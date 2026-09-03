import { app } from "electron"
import { cp, mkdir, readdir, rm, readFile, writeFile, stat } from "fs/promises"
import { join } from "path"
import { vaultRoot } from "./vault"
import {
  backupFolderName,
  parseBackupFolderName,
  sortBackups,
  selectExpiredBackups,
  selectExpiredVersions,
  versionKey,
  versionFileName,
  DEFAULT_BACKUP_LIMIT,
  DEFAULT_VERSION_LIMIT
} from "../shared/backup"
import { BackupSummary } from "../shared/types"

/** Autosave fires constantly; versions are only worth keeping this far apart. */
const VERSION_INTERVAL_MS = 5 * 60 * 1000

const VERSIONS_DIR = ".versions"

/** Kept beside the vault rather than inside it, so backups never nest. */
export function backupRoot(): string {
  return join(app.getPath("documents"), "Tova Backups")
}

async function countMarkdown(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  let total = 0

  for (const entry of entries) {
    if (entry.name === VERSIONS_DIR) continue
    if (entry.isDirectory()) {
      total += await countMarkdown(join(directory, entry.name))
    } else if (entry.name.endsWith(".md")) {
      total += 1
    }
  }
  return total
}

async function summarize(name: string): Promise<BackupSummary> {
  const createdAt = parseBackupFolderName(name)?.getTime() ?? 0
  return { name, createdAt, noteCount: await countMarkdown(join(backupRoot(), name)) }
}

export async function listBackups(): Promise<BackupSummary[]> {
  const entries = await readdir(backupRoot()).catch(() => [] as string[])
  return Promise.all(sortBackups(entries).map(summarize))
}

async function pruneBackups(limit: number): Promise<void> {
  const entries = await readdir(backupRoot()).catch(() => [] as string[])
  for (const name of selectExpiredBackups(entries, limit)) {
    await rm(join(backupRoot(), name), { recursive: true, force: true })
  }
}

/**
 * Finds a free folder name, stepping forward a second at a time on collision.
 * Skipping the run instead would silently drop the safety copy restoreBackup
 * takes, which is the one backup that must never be missed.
 */
async function reserveBackupName(root: string, at: Date): Promise<string> {
  const candidate = new Date(at)

  for (let attempt = 0; attempt < 120; attempt++) {
    const name = backupFolderName(candidate)
    const taken = await stat(join(root, name)).then(
      () => true,
      () => false
    )
    if (!taken) return name
    candidate.setSeconds(candidate.getSeconds() + 1)
  }

  throw new Error("Could not find a free backup folder name")
}

export async function runBackup(limit = DEFAULT_BACKUP_LIMIT): Promise<BackupSummary> {
  const root = backupRoot()
  await mkdir(root, { recursive: true })

  const name = await reserveBackupName(root, new Date())
  await cp(vaultRoot(), join(root, name), { recursive: true })
  await pruneBackups(limit)

  return summarize(name)
}

/**
 * Replaces the vault with a backup. The current vault is backed up first, so
 * restoring the wrong snapshot is itself recoverable.
 */
export async function restoreBackup(name: string): Promise<BackupSummary> {
  if (parseBackupFolderName(name) === null) throw new Error(`Unknown backup: ${name}`)

  const source = join(backupRoot(), name)
  await stat(source)

  await runBackup()
  await rm(vaultRoot(), { recursive: true, force: true })
  await cp(source, vaultRoot(), { recursive: true })

  return summarize(name)
}

function versionDir(noteId: string): string {
  return join(vaultRoot(), VERSIONS_DIR, versionKey(noteId))
}

/**
 * Snapshots a note's previous contents, at most once per interval, keeping the
 * most recent ten.
 */
export async function saveVersion(
  noteId: string,
  content: string,
  now = new Date()
): Promise<void> {
  const directory = versionDir(noteId)
  await mkdir(directory, { recursive: true })

  const existing = (await readdir(directory).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".md"))
    .sort()

  const newest = existing[existing.length - 1]
  if (newest !== undefined) {
    const takenAt = parseBackupFolderName(newest.replace(/\.md$/, ""))
    if (takenAt !== null && now.getTime() - takenAt.getTime() < VERSION_INTERVAL_MS) return
  }

  await writeFile(join(directory, versionFileName(now)), content, "utf-8")

  const remaining = await readdir(directory).catch(() => [] as string[])
  for (const expired of selectExpiredVersions(remaining, DEFAULT_VERSION_LIMIT)) {
    await rm(join(directory, expired), { force: true })
  }
}

export async function listVersions(noteId: string): Promise<string[]> {
  const entries = await readdir(versionDir(noteId)).catch(() => [] as string[])
  return entries.filter((name) => name.endsWith(".md")).sort((a, b) => b.localeCompare(a))
}

export async function readVersion(noteId: string, version: string): Promise<string> {
  if (parseBackupFolderName(version.replace(/\.md$/, "")) === null) {
    throw new Error(`Unknown version: ${version}`)
  }
  return readFile(join(versionDir(noteId), version), "utf-8")
}

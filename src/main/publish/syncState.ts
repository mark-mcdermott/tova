import { app } from "electron"
import { createHash } from "crypto"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"

/*
 * What each blog looked like at the end of its last sync. Two fingerprints per
 * post: the remote blob SHA, so a change on the blog is visible, and a hash of
 * the local file, so a change here is too. Both changing is a conflict; one
 * changing is simply the newer side.
 */

export interface PostState {
  /** GitHub blob SHA when this post was last synced. */
  remoteSha: string
  /** Hash of the local file's content at that same moment. */
  localHash: string
}

export interface BlogSyncState {
  lastSyncedAt: number
  posts: Record<string, PostState>
}

type SyncFile = Record<string, BlogSyncState>

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex")
}

function pathToState(): string {
  return join(app.getPath("userData"), "blog-sync.json")
}

async function load(): Promise<SyncFile> {
  try {
    const parsed: unknown = JSON.parse(await readFile(pathToState(), "utf-8"))
    return typeof parsed === "object" && parsed !== null ? (parsed as SyncFile) : {}
  } catch {
    return {}
  }
}

export async function syncStateFor(blogId: string): Promise<BlogSyncState> {
  const file = await load()
  return file[blogId] ?? { lastSyncedAt: 0, posts: {} }
}

export async function saveSyncState(blogId: string, state: BlogSyncState): Promise<void> {
  const file = await load()
  file[blogId] = state

  const path = pathToState()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(file, null, 2), "utf-8")
}

export async function forgetSyncState(blogId: string): Promise<void> {
  const file = await load()
  delete file[blogId]

  const path = pathToState()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(file, null, 2), "utf-8")
}

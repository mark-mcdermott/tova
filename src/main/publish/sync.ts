import { readdir, readFile } from "fs/promises"
import { BlogSummary } from "../../shared/types"
import {
  applyEdit,
  fieldValue,
  fromYaml,
  parsePosts,
  publishedFieldEdit
} from "../../shared/blogPost"
import { LocalPost, RemotePost, planSync } from "../../shared/syncPlan"
import { blogSecret } from "../blogs"
import { createNote, writeNote } from "../notes"
import { directoryOf } from "../vault"
import { listDirectory, readFileContent } from "./github"
import { PostState, hashContent, saveSyncState, syncStateFor } from "./syncState"

export interface SyncResult {
  blogId: string
  imported: number
  updated: number
  unchanged: number
  /** Changed here since the last sync — the rocket sends them, not the sync. */
  awaitingPublish: string[]
  /** Changed on both sides. Left untouched, both copies intact. */
  conflicts: string[]
  /** Gone from the blog but still here. Never deleted automatically. */
  removedRemotely: string[]
  syncedAt: number
}

function noteId(blog: BlogSummary, filename: string): string {
  return `posts/${blog.name}/${filename}`
}

function localPath(blog: BlogSummary, filename: string): string {
  return `${directoryOf("posts", blog.name)}/${filename}`
}

async function localPosts(blog: BlogSummary): Promise<LocalPost[]> {
  const directory = directoryOf("posts", blog.name)
  const entries = await readdir(directory).catch(() => [] as string[])

  const posts: LocalPost[] = []
  for (const filename of entries.filter((name) => name.endsWith(".md"))) {
    const content = await readFile(`${directory}/${filename}`, "utf-8").catch(() => null)
    if (content !== null) posts.push({ filename, hash: hashContent(content) })
  }
  return posts
}

/** The title an imported post should carry, taken from its own front matter. */
function titleOf(body: string, filename: string): string {
  const [post] = parsePosts(body)
  const title = post === undefined ? null : fieldValue(post, "title")
  return title === null || title.trim() === "" ? filename.replace(/\.md$/, "") : title
}

async function writeLocal(
  blog: BlogSummary,
  filename: string,
  raw: string,
  exists: boolean
): Promise<void> {
  const imported = fromYaml(raw, blog.name)

  // An imported post is already on the blog, under this exact filename.
  // Recording that is what makes a later republish update it rather than
  // create a second file under a name computed from the title.
  const [post] = parsePosts(imported)
  const body =
    post === undefined
      ? imported
      : applyEdit(imported, publishedFieldEdit(imported, post, filename))

  const title = titleOf(body, filename)

  if (exists) {
    await writeNote(noteId(blog, filename), title, body)
    return
  }

  await createNote({ section: "posts", folder: blog.name, title, body, filename })
}

/**
 * Brings one blog's posts down. Deliberately one-directional: a post changed
 * here is reported rather than pushed, because publishing is something the
 * writer does with the rocket when the post is ready, not something a
 * background sync decides for them. Conflicts are left alone with both copies
 * intact.
 */
export async function syncBlog(blog: BlogSummary): Promise<SyncResult> {
  const token = await blogSecret(blog.id, "github")
  if (token === null) throw new Error(`${blog.name} has no GitHub token saved`)

  const files = await listDirectory(
    blog.github.repo,
    blog.github.branch,
    blog.github.contentPath,
    token
  )

  const remote: RemotePost[] = files.map((file) => ({ filename: file.name, sha: file.sha }))
  const local = await localPosts(blog)
  const state = await syncStateFor(blog.id)
  const plan = planSync(remote, local, state.posts)

  const result: SyncResult = {
    blogId: blog.id,
    imported: 0,
    updated: 0,
    unchanged: 0,
    awaitingPublish: [],
    conflicts: [],
    removedRemotely: [],
    syncedAt: Date.now()
  }

  const posts: Record<string, PostState> = { ...state.posts }
  const shaOf = new Map(remote.map((post) => [post.filename, post.sha]))

  for (const { filename, action } of plan) {
    if (action === "conflict") {
      result.conflicts.push(filename)
      continue
    }
    if (action === "publishLocal") {
      result.awaitingPublish.push(filename)
      continue
    }
    if (action === "removedRemotely") {
      result.removedRemotely.push(filename)
      delete posts[filename]
      continue
    }
    if (action === "unchanged") {
      result.unchanged++
      continue
    }

    const file = files.find((entry) => entry.name === filename)
    if (file === undefined) continue

    const raw = await readFileContent(blog.github.repo, blog.github.branch, file.path, token)
    await writeLocal(blog, filename, raw, action === "update")

    // Hashed from what actually landed on disk — Tova adds its own front matter
    // on the way in, so the fetched text is not what the next sync will see.
    posts[filename] = {
      remoteSha: shaOf.get(filename) ?? file.sha,
      localHash: hashContent(await readFile(localPath(blog, filename), "utf-8"))
    }

    if (action === "import") result.imported++
    else result.updated++
  }

  await saveSyncState(blog.id, { lastSyncedAt: result.syncedAt, posts })
  return result
}

import { ipcMain } from "electron"
import { canStoreSecrets, deleteBlog, listBlogs, saveBlog, setBlogSecret } from "../blogs"
import {
  conflictVersions,
  deletePost,
  keepLocal,
  localPostCount,
  syncBlog,
  takeRemote,
  trashBlogPosts
} from "../publish/sync"
import { forgetSyncState, syncStateFor } from "../publish/syncState"
import { Blog, BlogSecret, BlogSummary } from "../../shared/types"
import { EMPTY_BLOG } from "../../shared/blogConfig"

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function text(source: Record<string, unknown>, key: string, fallback = ""): string {
  const value = source[key]
  return typeof value === "string" ? value : fallback
}

/** Rebuilt field by field, so nothing the renderer invents reaches the file. */
function asBlog(value: unknown): Blog {
  const raw = asRecord(value, "blog")
  const github = asRecord(raw.github ?? {}, "github")
  const deploy = asRecord(raw.deploy ?? {}, "deploy")
  const provider = text(deploy, "provider", "none")

  return {
    id: text(raw, "id"),
    name: text(raw, "name"),
    sidebarLabel: text(raw, "sidebarLabel"),
    siteUrl: text(raw, "siteUrl"),
    livePostPath: text(raw, "livePostPath", EMPTY_BLOG.livePostPath),
    github: {
      repo: text(github, "repo"),
      branch: text(github, "branch", EMPTY_BLOG.github.branch),
      contentPath: text(github, "contentPath")
    },
    deploy: {
      provider:
        provider === "cloudflare" || provider === "vercel" || provider === "none"
          ? provider
          : "none",
      accountId: text(deploy, "accountId"),
      projectName: text(deploy, "projectName"),
      projectId: text(deploy, "projectId")
    }
  }
}

function asSecret(value: unknown): BlogSecret {
  const name = asString(value, "secret")
  if (name !== "github" && name !== "cloudflare" && name !== "vercel") {
    throw new Error(`Unknown secret: ${name}`)
  }
  return name
}

async function requireBlog(id: string): Promise<BlogSummary> {
  const blog = (await listBlogs()).find((entry) => entry.id === id)
  if (blog === undefined) throw new Error("That blog no longer exists")
  return blog
}

export function registerBlogHandlers(): void {
  ipcMain.handle("blog:list", () => listBlogs())
  ipcMain.handle("blog:save", (_event, blog) => saveBlog(asBlog(blog)))
  ipcMain.handle("blog:postCount", async (_event, id) =>
    localPostCount(await requireBlog(asString(id, "id")))
  )

  ipcMain.handle("blog:delete", async (_event, id, trashPosts) => {
    if (typeof trashPosts !== "boolean") throw new Error("trashPosts must be a boolean")
    const blogId = asString(id, "id")

    // Read before the configuration goes, since finding the posts needs it.
    if (trashPosts) await trashBlogPosts(await requireBlog(blogId))

    await deleteBlog(blogId)
    await forgetSyncState(blogId)
  })

  ipcMain.handle("blog:sync", async (_event, id) => syncBlog(await requireBlog(asString(id, "id"))))

  ipcMain.handle("blog:conflict", async (_event, id, filename) =>
    conflictVersions(await requireBlog(asString(id, "id")), asString(filename, "filename"))
  )

  ipcMain.handle("blog:resolve", async (_event, id, filename, keep) => {
    const blog = await requireBlog(asString(id, "id"))
    const name = asString(filename, "filename")
    const choice = asString(keep, "keep")

    if (choice !== "local" && choice !== "remote") throw new Error(`Unknown choice: ${choice}`)
    if (choice === "remote") await takeRemote(blog, name)
    else await keepLocal(blog, name)
  })

  ipcMain.handle("blog:deletePost", async (_event, id, filename, alsoRemote) => {
    if (typeof alsoRemote !== "boolean") throw new Error("alsoRemote must be a boolean")
    await deletePost(
      await requireBlog(asString(id, "id")),
      asString(filename, "filename"),
      alsoRemote
    )
  })

  ipcMain.handle("blog:lastSynced", async () => {
    const blogs = await listBlogs()
    const entries = await Promise.all(
      blogs.map(async (blog) => [blog.id, (await syncStateFor(blog.id)).lastSyncedAt] as const)
    )
    return Object.fromEntries(entries)
  })
  ipcMain.handle("blog:canStoreSecrets", () => canStoreSecrets())

  ipcMain.handle("blog:setSecret", (_event, id, secret, value) =>
    setBlogSecret(asString(id, "id"), asSecret(secret), asString(value, "value"))
  )
}

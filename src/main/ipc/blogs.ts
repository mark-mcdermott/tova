import { ipcMain } from "electron"
import { canStoreSecrets, deleteBlog, listBlogs, saveBlog, setBlogSecret } from "../blogs"
import { Blog, BlogSecret } from "../../shared/types"
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

export function registerBlogHandlers(): void {
  ipcMain.handle("blog:list", () => listBlogs())
  ipcMain.handle("blog:save", (_event, blog) => saveBlog(asBlog(blog)))
  ipcMain.handle("blog:delete", (_event, id) => deleteBlog(asString(id, "id")))
  ipcMain.handle("blog:canStoreSecrets", () => canStoreSecrets())

  ipcMain.handle("blog:setSecret", (_event, id, secret, value) =>
    setBlogSecret(asString(id, "id"), asSecret(secret), asString(value, "value"))
  )
}

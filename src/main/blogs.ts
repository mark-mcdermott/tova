import { app, safeStorage } from "electron"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { Blog, BlogSecret, BlogSummary } from "../shared/types"
import { normalizeBlog, validateBlog } from "../shared/blogConfig"

/*
 * Blog configuration lives in the app's own data directory, never in the vault.
 * Xin kept it inside the vault, which put a GitHub token in cleartext in the
 * user's Documents folder and swept it into every backup. Here the file holds
 * only non-secret fields in the clear; tokens are encrypted against the OS
 * keychain and are never returned to the renderer.
 */

interface StoredBlog extends Blog {
  /** Base64 of safeStorage ciphertext, keyed by secret name. */
  secrets: Partial<Record<BlogSecret, string>>
}

interface StoredConfig {
  blogs: StoredBlog[]
}

function pathToConfig(): string {
  return join(app.getPath("userData"), "blogs.json")
}

async function load(): Promise<StoredConfig> {
  try {
    const parsed: unknown = JSON.parse(await readFile(pathToConfig(), "utf-8"))
    if (typeof parsed !== "object" || parsed === null) return { blogs: [] }
    const blogs = (parsed as { blogs?: unknown }).blogs
    return { blogs: Array.isArray(blogs) ? (blogs as StoredBlog[]) : [] }
  } catch {
    // No file yet, or one that cannot be read — either way, no blogs.
    return { blogs: [] }
  }
}

async function persist(config: StoredConfig): Promise<void> {
  const path = pathToConfig()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(config, null, 2), "utf-8")
}

function toSummary(stored: StoredBlog): BlogSummary {
  const { secrets: _secrets, ...blog } = stored
  return {
    ...blog,
    hasGithubToken: typeof stored.secrets.github === "string",
    hasDeployToken:
      typeof stored.secrets.cloudflare === "string" || typeof stored.secrets.vercel === "string"
  }
}

export function canStoreSecrets(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function listBlogs(): Promise<BlogSummary[]> {
  const { blogs } = await load()
  return blogs.map(toSummary)
}

export async function saveBlog(blog: Blog): Promise<BlogSummary> {
  const config = await load()
  const normalized = normalizeBlog(blog)

  const errors = validateBlog(normalized, config.blogs.map(toSummary))
  const first = Object.values(errors)[0]
  if (first !== undefined) throw new Error(first)

  const index = config.blogs.findIndex((entry) => entry.id === normalized.id)

  if (index === -1) {
    const created: StoredBlog = { ...normalized, id: crypto.randomUUID(), secrets: {} }
    config.blogs.push(created)
    await persist(config)
    return toSummary(created)
  }

  // Secrets are set through their own call, so an edit never has to resend them.
  const updated: StoredBlog = { ...normalized, secrets: config.blogs[index].secrets }
  config.blogs[index] = updated
  await persist(config)
  return toSummary(updated)
}

export async function deleteBlog(id: string): Promise<void> {
  const config = await load()
  config.blogs = config.blogs.filter((blog) => blog.id !== id)
  await persist(config)
}

export async function setBlogSecret(
  id: string,
  secret: BlogSecret,
  value: string
): Promise<BlogSummary> {
  const config = await load()
  const blog = config.blogs.find((entry) => entry.id === id)
  if (blog === undefined) throw new Error("That blog no longer exists")

  if (value === "") {
    delete blog.secrets[secret]
  } else {
    if (!canStoreSecrets()) {
      throw new Error("This machine has no keychain available, so a token cannot be stored safely")
    }
    blog.secrets[secret] = safeStorage.encryptString(value).toString("base64")
  }

  await persist(config)
  return toSummary(blog)
}

/**
 * Main-process only, and deliberately not on the IPC surface: a token is read
 * here to make a request, and never travels back to the renderer.
 */
export async function blogSecret(id: string, secret: BlogSecret): Promise<string | null> {
  const { blogs } = await load()
  const stored = blogs.find((blog) => blog.id === id)?.secrets[secret]
  if (stored === undefined) return null

  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"))
  } catch {
    // A keychain that changed underneath us — treat it as no token rather than
    // taking the app down on a read.
    return null
  }
}

export async function findBlogByName(name: string): Promise<BlogSummary | null> {
  const blogs = await listBlogs()
  return blogs.find((blog) => blog.name === name) ?? null
}

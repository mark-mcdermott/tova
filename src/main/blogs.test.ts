import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { EMPTY_BLOG } from "../shared/blogConfig"
import { Blog } from "../shared/types"

const state = vi.hoisted(() => ({ userData: "", encryptionAvailable: true }))

vi.mock("electron", () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    // Stands in for the keychain: reversible, and clearly not the plaintext.
    encryptString: (value: string) => Buffer.from(`sealed:${value}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace(/^sealed:/, "")
  }
}))

const { blogSecret, canStoreSecrets, deleteBlog, listBlogs, saveBlog, setBlogSecret } =
  await import("./blogs")

function blog(overrides: Partial<Blog> = {}): Blog {
  return {
    ...EMPTY_BLOG,
    name: "markmcdermott.io",
    github: { repo: "mark-mcdermott/blog", branch: "main", contentPath: "src/content/posts/" },
    ...overrides
  }
}

const created: string[] = []

beforeEach(async () => {
  state.userData = await mkdtemp(join(tmpdir(), "tova-blogs-"))
  state.encryptionAvailable = true
  created.push(state.userData)
})

afterAll(async () => {
  for (const path of created) await rm(path, { recursive: true, force: true })
})

describe("blogs", () => {
  it("starts with none and no file to read", async () => {
    expect(await listBlogs()).toEqual([])
  })

  it("gives a new blog an id and reports it has no token yet", async () => {
    const saved = await saveBlog(blog())

    expect(saved.id).not.toBe("")
    expect(saved.hasGithubToken).toBe(false)
    expect(await listBlogs()).toHaveLength(1)
  })

  it("refuses a blog the shared validator rejects", async () => {
    await expect(saveBlog(blog({ name: "two words" }))).rejects.toThrow(/@handle/)
  })

  it("updates in place rather than adding a second", async () => {
    const saved = await saveBlog(blog())
    await saveBlog({ ...blog({ id: saved.id }), siteUrl: "https://example.com" })

    const blogs = await listBlogs()
    expect(blogs).toHaveLength(1)
    expect(blogs[0].siteUrl).toBe("https://example.com")
  })

  it("keeps the stored token across an edit that does not mention it", async () => {
    const saved = await saveBlog(blog())
    await setBlogSecret(saved.id, "github", "ghp_secret")
    await saveBlog({ ...blog({ id: saved.id }), sidebarLabel: "My Blog" })

    expect((await listBlogs())[0].hasGithubToken).toBe(true)
    expect(await blogSecret(saved.id, "github")).toBe("ghp_secret")
  })

  it("never writes a token in the clear", async () => {
    const saved = await saveBlog(blog())
    await setBlogSecret(saved.id, "github", "ghp_secret")

    const raw = await readFile(join(state.userData, "blogs.json"), "utf-8")
    expect(raw).not.toContain("ghp_secret")
  })

  it("keeps the config out of the vault entirely", async () => {
    await saveBlog(blog())
    // Xin put this in the vault, which swept a token into every backup.
    const raw = await readFile(join(state.userData, "blogs.json"), "utf-8")
    expect(raw).toContain("markmcdermott.io")
  })

  it("does not hand a token back through the listing", async () => {
    const saved = await saveBlog(blog())
    await setBlogSecret(saved.id, "github", "ghp_secret")

    expect(JSON.stringify(await listBlogs())).not.toContain("ghp_secret")
  })

  it("clears a secret when given an empty value", async () => {
    const saved = await saveBlog(blog())
    await setBlogSecret(saved.id, "github", "ghp_secret")

    const cleared = await setBlogSecret(saved.id, "github", "")
    expect(cleared.hasGithubToken).toBe(false)
    expect(await blogSecret(saved.id, "github")).toBeNull()
  })

  it("refuses to store a token when there is no keychain to seal it with", async () => {
    const saved = await saveBlog(blog())
    state.encryptionAvailable = false

    await expect(setBlogSecret(saved.id, "github", "ghp_secret")).rejects.toThrow(/keychain/)
    expect(canStoreSecrets()).toBe(false)
  })

  it("reports a deploy token separately from the github one", async () => {
    const saved = await saveBlog(
      blog({ deploy: { provider: "vercel", accountId: "", projectName: "", projectId: "prj" } })
    )
    await setBlogSecret(saved.id, "vercel", "vercel_token")

    const [listed] = await listBlogs()
    expect(listed.hasDeployToken).toBe(true)
    expect(listed.hasGithubToken).toBe(false)
  })

  it("forgets a deleted blog", async () => {
    const saved = await saveBlog(blog())
    await deleteBlog(saved.id)
    expect(await listBlogs()).toEqual([])
  })
})

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { EMPTY_BLOG } from "../../shared/blogConfig"
import { BlogSummary } from "../../shared/types"

const paths = vi.hoisted(() => ({ documents: "", userData: "" }))

vi.mock("electron", () => ({
  app: { getPath: (name: string) => (name === "userData" ? paths.userData : paths.documents) }
}))

const blogSecret = vi.fn()
vi.mock("../blogs", () => ({ blogSecret: (...args: unknown[]) => blogSecret(...args) }))

const listDirectory = vi.fn()
const readFileContent = vi.fn()
vi.mock("./github", () => ({
  listDirectory: (...args: unknown[]) => listDirectory(...args),
  readFileContent: (...args: unknown[]) => readFileContent(...args)
}))

const { syncBlog } = await import("./sync")
const { ensureVault, vaultRoot } = await import("../vault")
const { listNotes } = await import("../notes")

const blog: BlogSummary = {
  ...EMPTY_BLOG,
  id: "blog-1",
  name: "markmcdermott.io",
  github: { repo: "me/blog", branch: "main", contentPath: "src/content/posts/" },
  hasGithubToken: true,
  hasDeployToken: false
}

const remotePost = `---
title: "Quick Git Notes"
date: "2026-05-17"
tags: ["Git", "Tutorial"]
---

The body from the blog.
`

function postPath(filename: string): string {
  return join(vaultRoot(), "posts", blog.name, filename)
}

const created: string[] = []

beforeEach(async () => {
  vi.clearAllMocks()
  paths.documents = await mkdtemp(join(tmpdir(), "tova-sync-"))
  paths.userData = await mkdtemp(join(tmpdir(), "tova-sync-data-"))
  created.push(paths.documents, paths.userData)

  await ensureVault()
  blogSecret.mockResolvedValue("ghp_token")
  listDirectory.mockResolvedValue([
    {
      name: "26-05-17-quick-git-notes.md",
      path: "src/content/posts/26-05-17-quick-git-notes.md",
      sha: "sha1"
    }
  ])
  readFileContent.mockResolvedValue(remotePost)
})

afterAll(async () => {
  for (const path of created) await rm(path, { recursive: true, force: true })
})

describe("syncBlog", () => {
  it("imports a post as a note under its blog", async () => {
    const result = await syncBlog(blog)

    expect(result.imported).toBe(1)
    const written = await readFile(postPath("26-05-17-quick-git-notes.md"), "utf-8")
    expect(written).toContain("@markmcdermott.io post")
    expect(written).toContain("@title Quick Git Notes")
    expect(written).toContain("The body from the blog.")
  })

  it("files it where the sidebar will find it", async () => {
    await syncBlog(blog)
    const [note] = await listNotes()

    expect(note.section).toBe("posts")
    expect(note.folder).toBe("markmcdermott.io")
    expect(note.title).toBe("Quick Git Notes")
  })

  it("does nothing the second time when nothing has moved", async () => {
    await syncBlog(blog)
    const second = await syncBlog(blog)

    expect(second.imported).toBe(0)
    expect(second.unchanged).toBe(1)
  })

  it("takes the blog's copy when only the blog changed", async () => {
    await syncBlog(blog)

    listDirectory.mockResolvedValue([
      {
        name: "26-05-17-quick-git-notes.md",
        path: "src/content/posts/26-05-17-quick-git-notes.md",
        sha: "sha2"
      }
    ])
    readFileContent.mockResolvedValue(remotePost.replace("The body from the blog.", "Rewritten."))

    const result = await syncBlog(blog)
    expect(result.updated).toBe(1)
    expect(await readFile(postPath("26-05-17-quick-git-notes.md"), "utf-8")).toContain("Rewritten.")
  })

  it("leaves a locally edited post for the rocket rather than pushing it", async () => {
    await syncBlog(blog)

    const path = postPath("26-05-17-quick-git-notes.md")
    await writeFile(path, (await readFile(path, "utf-8")) + "\nA local edit.\n", "utf-8")

    const result = await syncBlog(blog)
    expect(result.awaitingPublish).toEqual(["26-05-17-quick-git-notes.md"])
    expect(await readFile(path, "utf-8")).toContain("A local edit.")
  })

  it("refuses to pick a winner when both sides changed, and touches neither", async () => {
    await syncBlog(blog)

    const path = postPath("26-05-17-quick-git-notes.md")
    await writeFile(path, (await readFile(path, "utf-8")) + "\nA local edit.\n", "utf-8")
    listDirectory.mockResolvedValue([
      {
        name: "26-05-17-quick-git-notes.md",
        path: "src/content/posts/26-05-17-quick-git-notes.md",
        sha: "sha2"
      }
    ])

    const result = await syncBlog(blog)
    expect(result.conflicts).toEqual(["26-05-17-quick-git-notes.md"])
    expect(await readFile(path, "utf-8")).toContain("A local edit.")
  })

  it("keeps a post that has gone from the blog, and says so", async () => {
    await syncBlog(blog)
    listDirectory.mockResolvedValue([])

    const result = await syncBlog(blog)
    expect(result.removedRemotely).toEqual(["26-05-17-quick-git-notes.md"])
    expect(await readFile(postPath("26-05-17-quick-git-notes.md"), "utf-8")).toContain("@title")
  })

  it("will not sync a blog with no token", async () => {
    blogSecret.mockResolvedValue(null)
    await expect(syncBlog(blog)).rejects.toThrow(/no GitHub token/)
  })

  it("keeps two blogs independent", async () => {
    const other: BlogSummary = { ...blog, id: "blog-2", name: "other.dev" }
    await syncBlog(blog)
    await syncBlog(other)

    const notes = await listNotes()
    expect(notes.map((note) => note.folder).sort()).toEqual(["markmcdermott.io", "other.dev"])
  })
})

describe("imported posts and republishing", () => {
  it("records the filename it came from, so a republish updates rather than duplicates", async () => {
    await syncBlog(blog)
    const written = await readFile(postPath("26-05-17-quick-git-notes.md"), "utf-8")

    // Without this the rocket would compute a name from the title and push a
    // second file alongside the one it was imported from.
    expect(written).toContain("@published 26-05-17-quick-git-notes.md")
  })

  it("records a filename the post's own fields would never have produced", async () => {
    listDirectory.mockResolvedValue([
      { name: "legacy-name.md", path: "src/content/posts/legacy-name.md", sha: "sha1" }
    ])
    await syncBlog(blog)

    expect(await readFile(postPath("legacy-name.md"), "utf-8")).toContain(
      "@published legacy-name.md"
    )
  })
})

import { describe, it, expect, beforeEach, vi } from "vitest"
import { EMPTY_BLOG } from "../../shared/blogConfig"
import { BlogSummary, PublishUpdate } from "../../shared/types"

const blog: BlogSummary = {
  ...EMPTY_BLOG,
  id: "blog-1",
  name: "markmcdermott.io",
  siteUrl: "https://markmcdermott.io",
  livePostPath: "/posts/",
  github: { repo: "me/blog", branch: "main", contentPath: "src/content/posts/" },
  hasGithubToken: true,
  hasDeployToken: false
}

const findBlogByName = vi.fn()
const blogSecret = vi.fn()
const readNote = vi.fn()
const readFileSha = vi.fn()
const writeFile = vi.fn()
const deleteFile = vi.fn()
const deployStatus = vi.fn()
const remember = vi.fn()

vi.mock("../blogs", () => ({
  findBlogByName: (...args: unknown[]) => findBlogByName(...args),
  blogSecret: (...args: unknown[]) => blogSecret(...args)
}))
vi.mock("../notes", () => ({ readNote: (...args: unknown[]) => readNote(...args) }))
vi.mock("./github", () => ({
  readFileSha: (...args: unknown[]) => readFileSha(...args),
  writeFile: (...args: unknown[]) => writeFile(...args),
  deleteFile: (...args: unknown[]) => deleteFile(...args)
}))
vi.mock("./deploys", () => ({ deployStatus: (...args: unknown[]) => deployStatus(...args) }))
vi.mock("./timing", () => ({
  averageFor: async () => null,
  remember: (...args: unknown[]) => remember(...args)
}))

const { publish } = await import("./publisher")

const body = `@markmcdermott.io post
@title Quick Git Notes
@date 2026-05-17
@slug quick-git-notes

The body.
`

const request = { noteId: "notes/git.md", blog: "markmcdermott.io", headerLine: 0 }

function updates() {
  const seen: PublishUpdate[] = []
  return { seen, report: (update: PublishUpdate) => seen.push(update) }
}

beforeEach(() => {
  vi.clearAllMocks()
  findBlogByName.mockResolvedValue(blog)
  blogSecret.mockResolvedValue("ghp_token")
  readNote.mockResolvedValue({ body })
  readFileSha.mockResolvedValue(null)
  writeFile.mockResolvedValue("commit-sha")
  deployStatus.mockResolvedValue({ state: "succeeded", url: null, detail: null })
})

describe("publish", () => {
  it("pushes the computed filename with the post as YAML", async () => {
    const { report } = updates()
    const final = await publish(request, report)

    expect(final.phase).toBe("published")
    expect(final.filename).toBe("26-05-17-quick-git-notes.md")

    const [repo, branch, path, content] = writeFile.mock.calls[0]
    expect(repo).toBe("me/blog")
    expect(branch).toBe("main")
    expect(path).toBe("src/content/posts/26-05-17-quick-git-notes.md")
    expect(content).toContain('title: "Quick Git Notes"')
    expect(content).toContain("The body.")
  })

  it("reports its way there rather than only at the end", async () => {
    const { seen, report } = updates()
    await publish(request, report)

    expect(seen.map((update) => update.phase)).toContain("pushing")
    expect(seen.at(-1)?.progress).toBe(100)
  })

  it("links the post where it actually lives", async () => {
    const final = await publish(request, updates().report)
    expect(final.url).toBe("https://markmcdermott.io/posts/quick-git-notes")
  })

  it("updates in place when the file is already there", async () => {
    readFileSha.mockResolvedValue({ sha: "existing" })
    await publish(request, updates().report)

    expect(writeFile.mock.calls[0][6]).toBe("existing")
    expect(deleteFile).not.toHaveBeenCalled()
  })

  it("removes the old file when a rename gives the post a new name", async () => {
    readNote.mockResolvedValue({ body: body.replace("@slug", "@published 26-05-17-old.md\n@slug") })
    readFileSha.mockResolvedValue({ sha: "old-sha" })

    await publish(request, updates().report)

    expect(deleteFile).toHaveBeenCalled()
    expect(deleteFile.mock.calls[0][2]).toBe("src/content/posts/26-05-17-old.md")
  })

  it("leaves the file alone when the name has not changed", async () => {
    readNote.mockResolvedValue({
      body: body.replace("@slug", "@published 26-05-17-quick-git-notes.md\n@slug")
    })
    readFileSha.mockResolvedValue({ sha: "sha" })

    await publish(request, updates().report)
    expect(deleteFile).not.toHaveBeenCalled()
  })

  it("does not poll a blog that has no deploy provider", async () => {
    await publish(request, updates().report)
    expect(deployStatus).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
  })

  it("remembers how long a followed build took", async () => {
    findBlogByName.mockResolvedValue({
      ...blog,
      deploy: { ...blog.deploy, provider: "cloudflare", accountId: "a", projectName: "p" }
    })
    await publish(request, updates().report)

    expect(remember).toHaveBeenCalledWith("blog-1", expect.any(Number))
  })

  it("still counts as published when there is no token to follow the build", async () => {
    findBlogByName.mockResolvedValue({
      ...blog,
      deploy: { ...blog.deploy, provider: "vercel", projectId: "p" }
    })
    blogSecret.mockImplementation(async (_id: string, secret: string) =>
      secret === "github" ? "ghp_token" : null
    )

    const final = await publish(request, updates().report)
    expect(final.phase).toBe("published")
    expect(final.message).toMatch(/no deploy token/)
  })

  it("fails when the deploy does", async () => {
    findBlogByName.mockResolvedValue({
      ...blog,
      deploy: { ...blog.deploy, provider: "cloudflare", accountId: "a", projectName: "p" }
    })
    deployStatus.mockResolvedValue({ state: "failed", url: null, detail: "build" })

    const final = await publish(request, updates().report)
    expect(final.phase).toBe("failed")
    expect(final.error).toMatch(/build/)
  })

  it("says so when the blog is not configured", async () => {
    findBlogByName.mockResolvedValue(null)
    const final = await publish(request, updates().report)

    expect(final.phase).toBe("failed")
    expect(final.error).toMatch(/No blog named/)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("says so when there is no token to push with", async () => {
    blogSecret.mockResolvedValue(null)
    const final = await publish(request, updates().report)

    expect(final.error).toMatch(/no GitHub token/)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("publishes the post at the requested line, not merely the first", async () => {
    readNote.mockResolvedValue({
      body: `@markmcdermott.io post\n@title First\n\nA.\n\n@markmcdermott.io post\n@title Second\n@date 2026-01-02\n\nB.\n`
    })

    const final = await publish({ ...request, headerLine: 5 }, updates().report)
    expect(final.filename).toBe("26-01-02-second.md")
  })

  it("says so when the post has gone from the note", async () => {
    const final = await publish({ ...request, headerLine: 99 }, updates().report)
    expect(final.error).toMatch(/no longer in the note/)
  })
})

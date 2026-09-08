import { describe, it, expect } from "vitest"
import { EMPTY_BLOG, blogLabel, normalizeBlog, validateBlog } from "./blogConfig"
import { Blog, BlogSummary } from "./types"

function blog(overrides: Partial<Blog> = {}): Blog {
  return {
    ...EMPTY_BLOG,
    name: "markmcdermott.io",
    github: { repo: "mark-mcdermott/blog", branch: "main", contentPath: "src/content/posts/" },
    ...overrides
  }
}

function summary(overrides: Partial<BlogSummary> = {}): BlogSummary {
  return { ...blog(), hasGithubToken: true, hasDeployToken: false, ...overrides }
}

describe("validateBlog", () => {
  it("accepts a complete blog", () => {
    expect(validateBlog(blog(), [])).toEqual({})
  })

  it("requires a name", () => {
    expect(validateBlog(blog({ name: "  " }), []).name).toBeDefined()
  })

  it("refuses a name with a space, because it is the @handle", () => {
    expect(validateBlog(blog({ name: "my blog" }), []).name).toMatch(/@handle/)
  })

  it("refuses a name another blog already uses", () => {
    const existing = [summary({ id: "other", name: "markmcdermott.io" })]
    expect(validateBlog(blog({ id: "mine" }), existing).name).toMatch(/already uses/)
  })

  it("lets a blog keep its own name while being edited", () => {
    const existing = [summary({ id: "mine", name: "markmcdermott.io" })]
    expect(validateBlog(blog({ id: "mine" }), existing)).toEqual({})
  })

  it("insists the repository looks like owner/repo", () => {
    expect(validateBlog(blog({ github: { ...blog().github, repo: "blog" } }), []).repo).toMatch(
      /owner\/repo/
    )
  })

  it("asks Cloudflare for what Cloudflare needs", () => {
    const errors = validateBlog(
      blog({ deploy: { provider: "cloudflare", accountId: "", projectName: "", projectId: "" } }),
      []
    )
    expect(errors.accountId).toBeDefined()
    expect(errors.projectName).toBeDefined()
  })

  it("does not ask for deploy details that do not apply", () => {
    const errors = validateBlog(
      blog({ deploy: { provider: "none", accountId: "", projectName: "", projectId: "" } }),
      []
    )
    expect(errors).toEqual({})
  })
})

describe("normalizeBlog", () => {
  it("settles the content path on one shape", () => {
    const tidied = normalizeBlog(blog({ github: { ...blog().github, contentPath: "/src/posts" } }))
    expect(tidied.github.contentPath).toBe("src/posts/")
  })

  it("drops a trailing slash from the site URL so links do not double up", () => {
    expect(normalizeBlog(blog({ siteUrl: "https://example.com/" })).siteUrl).toBe(
      "https://example.com"
    )
  })
})

describe("blogLabel", () => {
  it("prefers the sidebar label", () => {
    expect(blogLabel(blog({ sidebarLabel: "My Blog" }))).toBe("My Blog")
  })

  it("falls back to the name", () => {
    expect(blogLabel(blog())).toBe("markmcdermott.io")
  })
})

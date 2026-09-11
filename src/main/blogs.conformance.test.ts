import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { normalizeBlog, postUrl, validateBlog } from "../shared/blogConfig"
import { Blog, BlogSummary } from "../shared/types"

/*
 * The other half of the fixture tests in src-tauri/src/blogs.rs.
 *
 * normalizeBlog has two quirks a tidier implementation would lose, and both
 * are pinned: an empty live path becomes "//", and an interior double slash is
 * left exactly as written. Neither is a good answer; both are the answer the
 * other backend gives, and a blog whose paths changed shape under one of them
 * would push posts somewhere else.
 */
interface Fixture {
  normalize: { blog: Blog; normalized: Blog }[]
  validate: { blog: Blog; errors: Record<string, string> }[]
  postUrl: { siteUrl: string; livePostPath: string; slug: string; url: string | null }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/blogs.json", "utf-8"))

const existing: BlogSummary[] = [
  {
    ...doc.normalize[0].normalized,
    id: "other",
    name: "taken",
    hasGithubToken: false,
    hasDeployToken: false
  }
]

describe("the blog conformance fixture", () => {
  it("says what a blog's values become on the way to disk", () => {
    for (const one of doc.normalize) {
      expect(normalizeBlog(one.blog), JSON.stringify(one.blog)).toEqual(one.normalized)
    }
  })

  it("says which blogs are refused, and why", () => {
    for (const one of doc.validate) {
      expect(validateBlog(one.blog, existing), JSON.stringify(one.blog)).toEqual(one.errors)
    }
  })

  it("says where a published post can be read", () => {
    for (const one of doc.postUrl) {
      const blog = { ...doc.normalize[0].normalized, ...one }

      expect(postUrl(blog, one.slug)).toBe(one.url)
    }
  })
})

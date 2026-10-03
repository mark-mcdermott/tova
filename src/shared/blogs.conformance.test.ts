// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { EMPTY_BLOG, normalizeBlog, postUrl, validateBlog } from "./blogConfig"
import type { Blog, BlogSummary } from "./types"

/*
 * The other half of `conformance/blogs.json`.
 *
 * Its readme says "both read this" and only the Rust did. The two quirks it
 * exists to pin — an empty live path becoming "//" and an interior double
 * slash left as written — are quirks of *this* file, and nothing was checking
 * that this file still had them. A tidier implementation here would have left
 * the Rust passing and pushed posts somewhere else.
 */
const fixture = JSON.parse(readFileSync("conformance/blogs.json", "utf-8")) as {
  normalize: { blog: Blog; normalized: Blog }[]
  validate: { blog: Blog; errors: Record<string, string> }[]
  postUrl: { siteUrl: string; livePostPath: string; slug: string; url: string | null }[]
}

/*
 * The one already-saved blog every `validate` case is measured against. It is
 * hardcoded on the Rust side rather than carried in the fixture, so it is
 * hardcoded identically here — a name clash is only a clash against something.
 */
const EXISTING: BlogSummary[] = [
  { ...EMPTY_BLOG, id: "other", name: "taken", hasGithubToken: false, hasDeployToken: false }
]

describe("normalising a blog, against every case the Rust answers", () => {
  it("has enough of them to be worth reading", () => {
    expect(fixture.normalize.length).toBeGreaterThan(10)
  })

  fixture.normalize.forEach(({ blog, normalized }, at) => {
    it(`case ${at}: ${JSON.stringify(blog.livePostPath)} ${JSON.stringify(blog.github.contentPath)}`, () => {
      expect(normalizeBlog(blog)).toEqual(normalized)
    })
  })
})

describe("refusing a blog, against every case the Rust answers", () => {
  fixture.validate.forEach(({ blog, errors }, at) => {
    it(`case ${at}: ${Object.keys(errors).join(", ") || "accepted"}`, () => {
      expect(validateBlog(blog, EXISTING)).toEqual(errors)
    })
  })
})

describe("linking to a published post, against every case the Rust answers", () => {
  fixture.postUrl.forEach(({ siteUrl, livePostPath, slug, url }, at) => {
    it(`case ${at}: ${siteUrl}${livePostPath}`, () => {
      expect(postUrl({ ...EMPTY_BLOG, siteUrl, livePostPath }, slug)).toBe(url)
    })
  })
})

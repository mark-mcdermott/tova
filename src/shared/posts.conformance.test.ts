// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import {
  applyEdit,
  fieldValue,
  fromYaml,
  normalizeDate,
  parsePosts,
  postDate,
  postFilename,
  postSlug,
  postTags,
  publishedAs,
  publishedFieldEdit,
  toYaml,
  type DocumentEdit
} from "./blogPost"
import {
  planSync,
  type KnownPost,
  type LocalPost,
  type PlannedPost,
  type RemotePost
} from "./syncPlan"

/*
 * The other half of `conformance/posts.json`.
 *
 * Its readme says "both read this" and only the Rust did. The offsets are what
 * that cost: `publishedFieldEdit` hands them to the editor, which counts UTF-16
 * code units, and one of these documents has an emoji in its title precisely so
 * a byte count lands somewhere else. The Rust was being held to that and this
 * side was not.
 */
const fixture = JSON.parse(readFileSync("conformance/posts.json", "utf-8")) as {
  posts: {
    doc: string
    posts: {
      blog: string
      body: string
      headerLine: number
      endLine: number
      fields: { name: string; value: string; line: number }[]
    }[]
    derived: {
      title: string | null
      TITLE: string | null
      date: string
      tags: string[]
      slug: string
      filename: string
      publishedAs: string | null
      yaml: string
    }[]
    edits: { edit: DocumentEdit; applied: string }[]
  }[]
  yaml: { raw: string; blog: string; at: string }[]
  dates: { value: string; normalized: string | null }[]
  plans: {
    remote: RemotePost[]
    local: LocalPost[]
    known: Record<string, KnownPost>
    plan: PlannedPost[]
  }[]
}

/** The same fixed day the Rust uses, since a filename falls back to today. */
const TODAY = new Date(2026, 8, 11)

const label = (doc: string, at: number) => `case ${at}: ${JSON.stringify(doc).slice(0, 44)}`

describe("reading posts out of a document, against every case the Rust answers", () => {
  fixture.posts.forEach(({ doc, posts }, at) => {
    it(label(doc, at), () => {
      expect(parsePosts(doc)).toEqual(posts)
    })
  })
})

describe("what is derived from a post, against every case the Rust answers", () => {
  fixture.posts.forEach(({ doc, derived }, at) => {
    it(label(doc, at), () => {
      const found = parsePosts(doc)

      expect(
        found.map((post) => ({
          title: fieldValue(post, "title"),
          // Field lookup is case-insensitive, which is easy to lose.
          TITLE: fieldValue(post, "TITLE"),
          date: postDate(post, TODAY),
          tags: postTags(post),
          slug: postSlug(post),
          filename: postFilename(post, TODAY),
          publishedAs: publishedAs(post),
          yaml: toYaml(post, TODAY)
        }))
      ).toEqual(derived)
    })
  })
})

describe("recording what a post went out as, against every case the Rust answers", () => {
  fixture.posts.forEach(({ doc, edits }, at) => {
    it(label(doc, at), () => {
      const found = parsePosts(doc)

      expect(
        found.map((post) => {
          const edit = publishedFieldEdit(doc, post, "26-09-11-new.md")
          return { edit, applied: applyEdit(doc, edit) }
        })
      ).toEqual(edits)
    })
  })
})

describe("converting a fetched post, against every case the Rust answers", () => {
  fixture.yaml.forEach(({ raw, blog, at }, index) => {
    it(`case ${index}: ${JSON.stringify(raw).slice(0, 44)}`, () => {
      expect(fromYaml(raw, blog)).toBe(at)
    })
  })
})

describe("reading a declared date, against every case the Rust answers", () => {
  fixture.dates.forEach(({ value, normalized }) => {
    it(`${JSON.stringify(value)}`, () => {
      expect(normalizeDate(value)).toBe(normalized)
    })
  })
})

describe("planning a sync, against every case the Rust answers", () => {
  fixture.plans.forEach(({ remote, local, known, plan }, at) => {
    it(`case ${at}: ${plan.map((one) => one.action).join(", ") || "nothing to do"}`, () => {
      expect(planSync(remote, local, known)).toEqual(plan)
    })
  })
})

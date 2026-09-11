import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  applyEdit,
  BlogPost,
  DocumentEdit,
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
  toYaml
} from "../shared/blogPost"
import { KnownPost, LocalPost, planSync, PlannedPost, RemotePost } from "../shared/syncPlan"

/*
 * The other half of src-tauri/src/posts_conformance.rs.
 *
 * The offsets in an edit are UTF-16 code units, because the editor that
 * applies them counts that way — one of these documents has an emoji in its
 * title for exactly that reason. The header and field patterns use \S and \w,
 * which without the u flag are ASCII, so the accented cases say what actually
 * happens rather than what a Unicode-aware regex would.
 */
interface Derived {
  title: string | null
  TITLE: string | null
  date: string
  tags: string[]
  slug: string
  filename: string
  publishedAs: string | null
  yaml: string
}

interface Fixture {
  posts: {
    doc: string
    posts: BlogPost[]
    derived: Derived[]
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

const doc: Fixture = JSON.parse(readFileSync("conformance/posts.json", "utf-8"))
const TODAY = new Date(2026, 8, 11)

describe("the post conformance fixture", () => {
  it("says which posts a document holds", () => {
    for (const one of doc.posts) {
      expect(parsePosts(one.doc), JSON.stringify(one.doc)).toEqual(one.posts)
    }
  })

  it("says what each post's fields amount to", () => {
    for (const one of doc.posts) {
      const parsed = parsePosts(one.doc)

      parsed.forEach((post, at) => {
        const want = one.derived[at]
        const what = JSON.stringify(one.doc)

        expect(fieldValue(post, "title"), what).toBe(want.title)
        expect(fieldValue(post, "TITLE"), what).toBe(want.TITLE)
        expect(postDate(post, TODAY), what).toBe(want.date)
        expect(postTags(post), what).toEqual(want.tags)
        expect(postSlug(post), what).toBe(want.slug)
        expect(postFilename(post, TODAY), what).toBe(want.filename)
        expect(publishedAs(post), what).toBe(want.publishedAs)
        expect(toYaml(post, TODAY), what).toBe(want.yaml)
      })
    }
  })

  it("says where the published line goes", () => {
    for (const one of doc.posts) {
      const parsed = parsePosts(one.doc)

      parsed.forEach((post, at) => {
        const edit = publishedFieldEdit(one.doc, post, "26-09-11-new.md")

        expect(edit, JSON.stringify(one.doc)).toEqual(one.edits[at].edit)
        expect(applyEdit(one.doc, edit)).toBe(one.edits[at].applied)
      })
    }
  })

  it("says what a fetched post becomes", () => {
    for (const one of doc.yaml) {
      expect(fromYaml(one.raw, one.blog), JSON.stringify(one.raw)).toBe(one.at)
    }
  })

  it("says which declared dates it understands", () => {
    for (const one of doc.dates) {
      expect(normalizeDate(one.value), JSON.stringify(one.value)).toBe(one.normalized)
    }
  })

  it("says what a sync should do", () => {
    for (const one of doc.plans) {
      expect(planSync(one.remote, one.local, one.known), JSON.stringify(one)).toEqual(one.plan)
    }
  })
})

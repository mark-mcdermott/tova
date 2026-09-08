import { describe, it, expect } from "vitest"
import {
  fieldValue,
  fromYaml,
  normalizeDate,
  parsePosts,
  postDate,
  postFilename,
  postSlug,
  postTags,
  toYaml
} from "./blogPost"

const post = `Some notes to myself.

@markmcdermott.io post
@title Quick Git Notes
@subtitle Amending, Squashing & Diffing
@date 2026-05-17
@tags Git, Tutorial
@slug quick-git-notes

The body starts here.

It runs to the marker.

---

And this is note prose again.
`

describe("parsePosts", () => {
  it("reads the block and leaves surrounding prose alone", () => {
    const [found] = parsePosts(post)

    expect(found.blog).toBe("markmcdermott.io")
    expect(found.fields.map((field) => field.name)).toEqual([
      "title",
      "subtitle",
      "date",
      "tags",
      "slug"
    ])
    expect(found.body).toBe("The body starts here.\n\nIt runs to the marker.")
  })

  it("finds nothing in an ordinary note", () => {
    expect(parsePosts("Just a note.\n\nWith an email@address.com in it.")).toEqual([])
  })

  it("ends a post at the next header, not only at a marker", () => {
    const two = `@one.com post
@title First

First body.

@two.com post
@title Second

Second body.
`
    const posts = parsePosts(two)
    expect(posts).toHaveLength(2)
    expect(posts[0].body).toBe("First body.")
    expect(posts[1].body).toBe("Second body.")
  })

  it("runs to the end of the document when nothing closes it", () => {
    const [found] = parsePosts("@a.com post\n@title T\n\nBody to the end.")
    expect(found.body).toBe("Body to the end.")
  })

  it("strips the outer quotes the spec allows", () => {
    const [found] = parsePosts('@a.com post\n@title "My Title"\n\nBody.')
    expect(fieldValue(found, "title")).toBe("My Title")
  })

  it("keeps a field with no value rather than dropping the line", () => {
    const [found] = parsePosts("@a.com post\n@draft\n\nBody.")
    expect(fieldValue(found, "draft")).toBe("")
  })

  it("stops collecting fields at the first line that is not one", () => {
    const [found] = parsePosts("@a.com post\n@title T\nBody line.\n@notafield still body")
    expect(found.fields).toHaveLength(1)
    expect(found.body).toBe("Body line.\n@notafield still body")
  })
})

describe("field readers", () => {
  const [found] = parsePosts(post)

  it("splits tags and preserves their case", () => {
    expect(postTags(found)).toEqual(["Git", "Tutorial"])
  })

  it("prefers an explicit slug", () => {
    expect(postSlug(found)).toBe("quick-git-notes")
  })

  it("falls back to a slug of the title", () => {
    const [other] = parsePosts("@a.com post\n@title Hello There\n\nBody.")
    expect(postSlug(other)).toBe("hello-there")
  })
})

describe("normalizeDate", () => {
  it("widens a two-digit year", () => {
    expect(normalizeDate("26-05-17")).toBe("2026-05-17")
  })

  it("passes a full date through", () => {
    expect(normalizeDate("2026-05-17")).toBe("2026-05-17")
  })

  it("refuses anything else", () => {
    expect(normalizeDate("May 17th")).toBeNull()
  })
})

describe("postDate", () => {
  it("defaults to today when the field is absent", () => {
    const [found] = parsePosts("@a.com post\n@title T\n\nBody.")
    expect(postDate(found, new Date(2026, 8, 7))).toBe("2026-09-07")
  })

  it("defaults to today when the field cannot be read", () => {
    const [found] = parsePosts("@a.com post\n@date whenever\n\nBody.")
    expect(postDate(found, new Date(2026, 8, 7))).toBe("2026-09-07")
  })
})

describe("postFilename", () => {
  it("is computed from the post, never from a stored template", () => {
    const [found] = parsePosts(post)
    expect(postFilename(found)).toBe("26-05-17-quick-git-notes.md")
  })

  it("falls back to today and an untitled slug", () => {
    const [found] = parsePosts("@a.com post\n\nBody.")
    expect(postFilename(found, new Date(2026, 8, 7))).toBe("26-09-07-untitled.md")
  })
})

describe("toYaml", () => {
  it("writes the Astro front matter a repo expects", () => {
    const [found] = parsePosts(post)

    expect(toYaml(found)).toBe(
      `---
title: "Quick Git Notes"
subtitle: "Amending, Squashing & Diffing"
date: "2026-05-17"
tags: ["git", "tutorial"]
slug: quick-git-notes
---

The body starts here.

It runs to the marker.
`
    )
  })

  it("passes unknown fields through instead of dropping them", () => {
    const [found] = parsePosts("@a.com post\n@title T\n@heroImage /images/git.jpg\n\nBody.")
    expect(toYaml(found, new Date(2026, 8, 7))).toContain('heroImage: "/images/git.jpg"')
  })

  it("switches to single quotes around a value carrying a double quote", () => {
    const [found] = parsePosts('@a.com post\n@title The "Good" Parts\n\nBody.')
    expect(toYaml(found, new Date(2026, 8, 7))).toContain("title: 'The \"Good\" Parts'")
  })
})

describe("fromYaml", () => {
  it("converts an imported post into the @ form", () => {
    const imported = `---
title: "Quick Git Notes"
date: "2026-05-17"
tags: ["Git", "Tutorial"]
---

The body starts here.
`
    expect(fromYaml(imported, "markmcdermott.io")).toBe(
      `@markmcdermott.io post
@title Quick Git Notes
@date 2026-05-17
@tags Git, Tutorial

The body starts here.
`
    )
  })

  it("round-trips a post without losing a field", () => {
    const [original] = parsePosts(post)
    const [returned] = parsePosts(fromYaml(toYaml(original), original.blog))

    expect(returned.blog).toBe(original.blog)
    expect(returned.body).toBe(original.body)
    expect(postSlug(returned)).toBe(postSlug(original))
    expect(postDate(returned)).toBe(postDate(original))
    // Tags lowercase on the way out to YAML, which is the documented direction.
    expect(postTags(returned)).toEqual(["git", "tutorial"])
  })

  it("keeps a field Tova does not know about across the round trip", () => {
    const [original] = parsePosts("@a.com post\n@title T\n@heroImage /images/git.jpg\n\nBody.")
    const [returned] = parsePosts(fromYaml(toYaml(original), "a.com"))
    expect(fieldValue(returned, "heroImage")).toBe("/images/git.jpg")
  })
})

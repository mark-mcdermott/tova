// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { ensureSyntaxTree } from "@codemirror/language"
import type { SyntaxNode } from "@lezer/common"

import { covers, spans } from "../shared/markdownSpans"
import { allTags } from "../shared/tags"

/*
 * A tag inside code, a URL, a link, an image or a heading is not a tag.
 *
 * Three things need to agree about this and two of them have no parser: the
 * editor asks its syntax tree and draws no pill inside a fence or a link, while
 * `markdown_spans.rs` and `markdownSpans.ts` write the rule out by hand.
 *
 * They had drifted twice, and each time in the direction that costs the writer
 * something. A `#deprecated` comment alone on a line in a pasted script was
 * read as a block head, so deleting that tag took the prose underneath — and
 * because the editor knew it was code and drew no tag, the reader had nothing
 * to warn them. Then a `#fragment` at the end of a URL was listed in the
 * sidebar as a tag of its own, sending a reader looking through a note for
 * something it never said.
 *
 * `conformance/tags.json` is generated from the parser below, by
 * `scripts/build-tag-conformance.mjs`, and read by both hand-written sides.
 */
const fixture = JSON.parse(readFileSync("conformance/tags.json", "utf-8")) as {
  occurrences: {
    name: string
    text: string
    tags: { tag: string; at: number; code: boolean; excluded: boolean }[]
  }[]
}

const CODE = /Code/
const EXCLUDES_TAGS = /Code|URL|Link|Image|Heading/

/** What the parser says about the `#` at `at`, exactly as the editor asks it. */
function parserSays(text: string, at: number): { code: boolean; excluded: boolean } {
  const state = EditorState.create({
    doc: text,
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })]
  })
  const tree = ensureSyntaxTree(state, text.length, 10_000)
  if (tree === null) throw new Error("the parser gave up")

  const answer = { code: false, excluded: false }
  for (let node: SyntaxNode | null = tree.resolveInner(at, 1); node; node = node.parent) {
    if (CODE.test(node.name)) answer.code = true
    if (EXCLUDES_TAGS.test(node.name)) answer.excluded = true
  }
  return answer
}

describe("the fixture still describes the parser", () => {
  it("has cases, with both answers in it", () => {
    expect(fixture.occurrences.length).toBeGreaterThan(100)
    const tags = fixture.occurrences.flatMap((one) => one.tags)
    expect(tags.some((tag) => tag.excluded)).toBe(true)
    expect(tags.some((tag) => !tag.excluded)).toBe(true)
    expect(tags.some((tag) => tag.code)).toBe(true)
  })

  /*
   * Offsets are counted in bytes by the Rust and in UTF-16 units here, so a
   * case with a character outside ASCII would mean two different positions and
   * the fixture would quietly stop comparing like with like.
   */
  it("holds nothing outside ASCII", () => {
    for (const { name, text } of fixture.occurrences) {
      expect(/^[\x00-\x7F]*$/.test(text), name).toBe(true)
    }
  })

  for (const { name, text, tags } of fixture.occurrences) {
    it(name, () => {
      for (const tag of tags) {
        expect(parserSays(text, tag.at), `${tag.tag} at ${tag.at}`).toEqual({
          code: tag.code,
          excluded: tag.excluded
        })
      }
    })
  }
})

describe("the hand-written rule reaches the same answer", () => {
  for (const { name, text, tags } of fixture.occurrences) {
    it(name, () => {
      const found = spans(text)
      for (const tag of tags) {
        expect(
          { code: covers(found.code, tag.at), excluded: covers(found.excluded, tag.at) },
          `${tag.tag} at ${tag.at}`
        ).toEqual({ code: tag.code, excluded: tag.excluded })
      }
    })
  }
})

describe("what a note is listed under", () => {
  it("leaves out a tag that only appears in code", () => {
    const body = "#real\n\n```sh\n#deprecated\n```\n\nA `#spanned` one too.\n"
    expect(allTags([], body)).toEqual(["real"])
  })

  it("leaves out a fragment at the end of a URL", () => {
    const body = "#real\n\nSee https://example.com/page#work and [it](/docs#here).\n"
    expect(allTags([], body)).toEqual(["real"])
  })

  it("leaves out a tag written into a heading", () => {
    expect(allTags([], "# A heading #work\n\n#real\n")).toEqual(["real"])
  })

  it("keeps a tag written in a nested list item", () => {
    expect(allTags([], "- item\n\n    #real\n")).toEqual(["real"])
  })

  it("keeps a tag that merely follows a link", () => {
    expect(allTags([], "[docs](/docs) #real\n")).toEqual(["real"])
  })
})

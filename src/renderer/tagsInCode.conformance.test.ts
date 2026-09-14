// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { EditorState } from "@codemirror/state"
import { markdown } from "@codemirror/lang-markdown"
import { ensureSyntaxTree } from "@codemirror/language"
import type { SyntaxNode } from "@lezer/common"

import { codeRanges, inCode } from "../shared/markdownCode"
import { allTags } from "../shared/tags"

/*
 * A tag inside code is not a tag.
 *
 * Three things need to agree about this and two of them have no parser: the
 * editor asks its syntax tree and draws no pill inside a fence, while
 * `markdown_code.rs` and `markdownCode.ts` write the rule out by hand.
 *
 * They had drifted, and in the direction that costs writing. A `#deprecated`
 * comment alone on a line in a pasted script was read as a block head, so
 * deleting that tag took the prose underneath — and because the editor knew it
 * was code and drew no tag, the reader had nothing to warn them.
 *
 * `conformance/tags.json` is generated from the parser below, by
 * `scripts/build-tag-conformance.mjs`, and read by both hand-written sides.
 */
const fixture = JSON.parse(readFileSync("conformance/tags.json", "utf-8")) as {
  occurrences: { name: string; text: string; tags: { tag: string; at: number; code: boolean }[] }[]
}

const CODE = /Code/

function parserSaysCode(text: string, at: number): boolean {
  const state = EditorState.create({ doc: text, extensions: [markdown()] })
  const tree = ensureSyntaxTree(state, text.length, 10_000)
  if (tree === null) throw new Error("the parser gave up")

  for (let node: SyntaxNode | null = tree.resolveInner(at, 1); node; node = node.parent) {
    if (CODE.test(node.name)) return true
  }
  return false
}

describe("the fixture still describes the parser", () => {
  it("has cases", () => {
    expect(fixture.occurrences.length).toBeGreaterThan(20)
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
        expect(parserSaysCode(text, tag.at), `${tag.tag} at ${tag.at}`).toBe(tag.code)
      }
    })
  }
})

describe("the hand-written rule reaches the same answer", () => {
  for (const { name, text, tags } of fixture.occurrences) {
    it(name, () => {
      const ranges = codeRanges(text)
      for (const tag of tags) {
        expect(inCode(ranges, tag.at), `${tag.tag} at ${tag.at}`).toBe(tag.code)
      }
    })
  }
})

describe("what a note is listed under", () => {
  it("leaves out a tag that only appears in code", () => {
    const body = "#real\n\n```sh\n#deprecated\n```\n\nA `#spanned` one too.\n"
    expect(allTags([], body)).toEqual(["real"])
  })

  it("keeps a tag written in a nested list item", () => {
    expect(allTags([], "- item\n\n    #real\n")).toEqual(["real"])
  })
})

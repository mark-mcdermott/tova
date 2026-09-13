// Reads the fixture from disk, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { syntaxTree } from "@codemirror/language"

/*
 * What counts as a line across the page.
 *
 * Two things need to agree about this and are written in different languages:
 * the editor, which draws the line, and `tag_blocks.rs`, which stops deleting
 * at one. A reader who separates a paragraph off with a divider and then
 * deletes a tag expects that paragraph to survive.
 *
 * They had already drifted. The Rust knew only dashes, so `***` was drawn as a
 * divider and not treated as one — text deliberately separated off would have
 * gone with the block above it. `conformance/rules.json` is generated from the
 * parser below and read by both sides.
 *
 * This half checks the fixture still describes the parser. If a Markdown
 * upgrade changes what a rule is, this fails rather than the deletion quietly
 * changing shape.
 */
const fixture = JSON.parse(readFileSync("conformance/rules.json", "utf-8")) as {
  rules: { line: string; rule: boolean }[]
}

/** Blank lines either side, which is the unambiguous context for the question. */
function drawsARule(line: string): boolean {
  const state = EditorState.create({
    doc: `Prose.\n\n${line}\n\nMore.\n`,
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })]
  })

  let found = false
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "HorizontalRule") found = true
    }
  })
  return found
}

describe("what the editor draws a rule for", () => {
  it("has a fixture worth checking, with both answers in it", () => {
    expect(fixture.rules.length).toBeGreaterThan(20)
    expect(fixture.rules.some((c) => c.rule)).toBe(true)
    expect(fixture.rules.some((c) => !c.rule)).toBe(true)
  })

  it.each(fixture.rules)("is $rule for $line", ({ line, rule }) => {
    expect(drawsARule(line)).toBe(rule)
  })
})

// Reads the stylesheets, so it says so.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * Everything in the rail lines up on one column.
 *
 * The search field used to sit at `--space-4` and the rows half a rem further
 * in, so the highlight on the open section stopped short of the field above it.
 * A stylesheet cannot be measured here, but it can be held to naming the same
 * token — which is what went wrong: two literals that happened to differ.
 */
const globals = readFileSync("src/renderer/styles/globals.css", "utf-8")
const sidebar = readFileSync("src/renderer/styles/sidebar.css", "utf-8")

function ruleFor(selector: string): string {
  const found = new RegExp(
    `\\n${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([^}]*)\\}`
  ).exec(sidebar)
  if (found === null) throw new Error(`no rule for ${selector}`)
  return found[1]
}

describe("the rail's column", () => {
  it("is one token, not a number repeated", () => {
    expect(/--sidebar-edge:\s*var\(--space-\d+\)/.test(globals)).toBe(true)
  })

  /* The four things whose left and right edges a reader sees together. */
  for (const selector of [
    ".sidebar-search",
    ".sidebar-places",
    ".sidebar-scroll",
    ".sidebar-footer"
  ]) {
    it(`${selector} sits on it`, () => {
      expect(ruleFor(selector)).toMatch(/var\(--sidebar-edge\)/)
    })
  }

  /* The header clears the traffic lights instead, so it is allowed to differ —
     but it should say so rather than drift. */
  it("does not drag the header along with it", () => {
    expect(/--sidebar-gutter:\s*calc\(var\(--space-6\)/.test(globals)).toBe(true)
  })
})

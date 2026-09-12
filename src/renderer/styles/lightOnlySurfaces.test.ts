// Reads the stylesheets, so it says so — the renderer's tsconfig does not
// expect Node.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * Some surfaces stay light in both themes.
 *
 * The popup menu is one: light glass, with its ink written out rather than
 * taken from a token — `#241f2e` for a row, `#6b6480` for a hint, `#b4232b`
 * for a destructive one. One row was left reading `var(--accent-bright)`,
 * which the dark theme redefines to a pale lavender. On this panel's white
 * that is 1.74:1, so every suggestion in every popup looked disabled, and one
 * was reported as a menu row that did nothing when clicked. It was clicked.
 * It could not be read.
 *
 * A token that changes with the theme cannot be used on a surface that does
 * not, and the failure is invisible in whichever theme was open at the time.
 */
const globals = readFileSync("src/renderer/styles/globals.css", "utf-8")
const sidebar = readFileSync("src/renderer/styles/sidebar.css", "utf-8")

/** Every token the dark theme redefines, which are the ones that move. */
function tokensThatFlip(): Set<string> {
  const dark = /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(globals)
  if (dark === null) throw new Error("Could not find the dark theme's block")

  return new Set([...dark[1].matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))
}

/** The rules making up one component, by class-name prefix. */
function rulesFor(source: string, prefix: string): [string, string][] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "")
  const found: [string, string][] = []
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (selector.includes(prefix)) found.push([selector.trim(), body])
  }
  return found
}

describe("a surface that stays light in both themes", () => {
  it("finds the tokens that move, rather than checking against an empty set", () => {
    const flipping = tokensThatFlip()
    expect(flipping.size).toBeGreaterThan(10)
    expect(flipping).toContain("--accent-bright")
  })

  it("finds the popup menu's rules", () => {
    expect(rulesFor(sidebar, ".popup-menu").length).toBeGreaterThan(3)
  })

  it("does not colour the popup menu with a token that changes underneath it", () => {
    const flipping = tokensThatFlip()

    for (const [selector, body] of rulesFor(sidebar, ".popup-menu")) {
      for (const [, token] of body.matchAll(/var\((--[\w-]+)\)/g)) {
        expect(flipping, `${selector} uses ${token}, which the dark theme moves`).not.toContain(
          token
        )
      }
    }
  })
})

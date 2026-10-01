// Reads the stylesheet, so it says so — the renderer's tsconfig does not
// expect Node.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * The title's height comes from a mirror: `.title-grow::after` carries the same
 * string and sizes the grid row, and the textarea stretches to fill it.
 *
 * That only holds while the two boxes measure the same. A textarea carries 2px
 * of top and bottom padding from the UA stylesheet that a `::after` does not,
 * so setting `padding-left` alone sized the row 4px short and clipped the
 * descenders off the last line of any title that wrapped — the tail of a `g`
 * gone, which is a bug this file's neighbour already records once.
 *
 * jsdom has no layout, so `scrollHeight` cannot catch it: it is 0 for every
 * element whatever the CSS says. What is checkable is the rule that prevents
 * it, which is that the shared block sets padding on all four sides.
 */
const editor = readFileSync("src/renderer/styles/editor.css", "utf-8")

/**
 * The body of the rule written against exactly this selector.
 *
 * Exactly, because `.title-input` appears both on its own and as the second
 * line of the shared rule's selector — a looser match hands back whichever
 * comes first and the test then checks the wrong block.
 */
function blockFor(selector: string): string {
  for (const [, found, body] of editor.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const normalised = found
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .replace(/\s*,\s*/g, ", ")
    if (normalised === selector) return body
  }
  throw new Error(`No rule written against \`${selector}\``)
}

/** The rule that names both boxes at once, which is what keeps them equal. */
function sharedBlock(): string {
  return blockFor(".title-grow::after, .title-input")
}

/** Declarations in a block, by property, with comments stripped. */
function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, property, value] of block
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(property.trim(), value.trim())
  }
  return found
}

describe("the title's mirror", () => {
  it("styles the mirror and the textarea in one rule", () => {
    // If they ever drift into separate rules this whole file is checking
    // nothing, so the guard says so rather than passing on an empty match.
    const shared = declarations(sharedBlock())
    expect(shared.size).toBeGreaterThan(4)
    expect(shared.get("font-size")).toBe("var(--text-title)")
    expect(shared.get("font-family")).toBe("var(--font-script)")
  })

  /*
   * Top and bottom have to be said, not left to the UA. A textarea carries 2px
   * there and a ::after carries none, so leaving it unsaid sizes the row 4px
   * short and the title loses the bottom of its last line once it wraps.
   */
  it("sets block padding on both boxes, so they measure the same", () => {
    const shared = declarations(sharedBlock())
    const hasBlock = shared.has("padding-block") || shared.has("padding")

    expect(hasBlock).toBe(true)
  })

  /*
   * The overhang room sits outside the column: a negative margin of the same
   * amount as the padding. Without it the title wraps a few pixels before the
   * prose does, which is the thing the column matching exists to prevent.
   */
  it("keeps the overhang room out of the measured column", () => {
    const shared = declarations(sharedBlock())

    expect(shared.get("padding-inline")).toBe("var(--title-overhang)")
    expect(shared.get("margin-inline")).toBe("calc(-1 * var(--title-overhang))")
  })

  it("gives both boxes the same line box", () => {
    // A number here would cut Vibur's descenders; the font's own metrics do not.
    expect(declarations(sharedBlock()).get("line-height")).toBe("normal")
  })

  /*
   * The subtle one, and the reason the title wrapped at roughly 540px against
   * the body's 700 after it first became a textarea.
   *
   * --prose-max is `45ch`, and `ch` is relative to the element's own font. The
   * box carrying the max-width therefore has to carry the body's font to
   * resolve it in — not the inherited UI font, and not the title's own 66px
   * script face. Nothing about a wrongly sized column looks broken, so there
   * is no second signal that it has drifted.
   */
  it("resolves the prose column in the font the prose is set in", () => {
    const column = declarations(blockFor(".title-grow"))

    expect(column.get("max-width")).toBe("var(--prose-max)")
    expect(column.get("font-family")).toBe("var(--font-mono)")
    expect(column.get("font-size")).toBe("var(--editor-font-size, var(--text-base))")
  })

  /*
   * On "Full" the prose has no max at all, so the two columns match only if
   * the title's right margin accounts for the body's pair of insets. Measured
   * in a harness at 900px: both columns 800px wide on Full, both 405px on
   * Narrow.
   */
  it("matches the prose on Full, where --prose-max does not apply", () => {
    const column = declarations(blockFor(".title-grow"))

    expect(column.get("margin-right")).toBe(
      "calc(var(--editor-inset) * 2 + var(--space-1) - var(--title-inset))"
    )
  })

  it("lets the mirror carry the title, and hides it", () => {
    const rules = declarations(blockFor(".title-grow::after"))

    // The trailing space is what gives an empty title a line to stand on.
    expect(rules.get("content")).toBe('attr(data-title) " "')
    expect(rules.get("visibility")).toBe("hidden")
    // Without pre-wrap the mirror collapses runs of spaces the textarea keeps,
    // and the two disagree about where the text wraps.
    expect(rules.get("white-space")).toBe("pre-wrap")
  })

  it("stops the textarea scrolling or growing a drag handle", () => {
    const rules = declarations(blockFor(".title-input"))

    expect(rules.get("overflow")).toBe("hidden")
    expect(rules.get("resize")).toBe("none")
  })

  /*
   * `text-indent` is what the input used to make room for a script capital's
   * overhang, and it applies to the first line only. With the title wrapping,
   * every line after the first would start a few pixels left of the one above.
   */
  it("makes overhang room with padding rather than a first-line indent", () => {
    // Comments stripped: this block explains why text-indent was dropped, and
    // the explanation is not the declaration.
    expect(declarations(sharedBlock()).has("text-indent")).toBe(false)
  })
})

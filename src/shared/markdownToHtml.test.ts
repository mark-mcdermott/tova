import { describe, it, expect } from "vitest"
import { escapeHtml, markdownToHtml } from "./markdownToHtml"

describe("escapeHtml", () => {
  it("escapes what would otherwise become markup", () => {
    expect(escapeHtml('<b>&"')).toBe("&lt;b&gt;&amp;&quot;")
  })
})

describe("markdownToHtml", () => {
  it("turns paragraphs into paragraphs, joining wrapped lines", () => {
    expect(markdownToHtml("one\ntwo\n\nthree")).toBe("<p>one two</p>\n<p>three</p>")
  })

  it("turns headings into headings at their level", () => {
    expect(markdownToHtml("# One\n### Three")).toBe("<h1>One</h1>\n<h3>Three</h3>")
  })

  it("gathers bullets into one list", () => {
    expect(markdownToHtml("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>")
  })

  it("keeps a code block whole, and unformatted inside", () => {
    expect(markdownToHtml("```\n**not bold**\n```")).toBe(
      "<pre><code>**not bold**</code></pre>"
    )
  })

  it("exports an unclosed fence rather than swallowing the rest", () => {
    // The writing matters more than the syntax being finished.
    expect(markdownToHtml("```\nstill mine")).toBe("<pre><code>still mine</code></pre>")
  })

  it("handles bold, italic, strike and code inline", () => {
    expect(markdownToHtml("**b** *i* ~~s~~ `c`")).toBe(
      "<p><strong>b</strong> <em>i</em> <del>s</del> <code>c</code></p>"
    )
  })

  it("makes links and images", () => {
    expect(markdownToHtml("[t](u)")).toBe('<p><a href="u">t</a></p>')
    expect(markdownToHtml("![a](u)")).toBe('<p><img alt="a" src="u"></p>')
  })

  it("rules off on a horizontal rule", () => {
    expect(markdownToHtml("a\n\n---\n\nb")).toBe("<p>a</p>\n<hr>\n<p>b</p>")
  })

  it("exports HTML in a note as the text it is", () => {
    // A note is prose, not a document someone else authored.
    expect(markdownToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
    )
  })

  it("escapes before it formats, so a link cannot smuggle markup", () => {
    expect(markdownToHtml('[t](" onerror="x)')).toContain("&quot;")
  })

  it("gives nothing for nothing", () => {
    expect(markdownToHtml("")).toBe("")
    expect(markdownToHtml("\n\n")).toBe("")
  })
})

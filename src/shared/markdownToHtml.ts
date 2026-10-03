/**
 * Markdown to HTML for export. Deliberately small and its own thing rather than
 * a renderer dependency: Tova only needs what its editor already writes, and a
 * general converter would be a large library for a single button.
 *
 * Everything is escaped before any markup is added, so a note containing HTML
 * exports as the text it is rather than as markup — a note is prose, not a
 * document someone else authored.
 */

import { parseTable, type Alignment, type Table } from "./tables"

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Inline constructs, applied to already-escaped text. */
function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
}

/**
 * A cell, aligned if its column said to be.
 *
 * `style` rather than the `align` attribute, which HTML dropped. Inline
 * because exported HTML has no stylesheet of Tova's to reach for — it is
 * pasted into somebody else's blog, and an alignment that only works with a
 * class is an alignment that does not work.
 *
 * `\|` becomes `|`. The parser keeps the escape because it exists to re-emit
 * markdown; here the markdown is being left behind, and a cell written
 * `one \| two` means `one | two`.
 */
function cell(tag: "th" | "td", text: string, alignment: Alignment): string {
  const style = alignment === null ? "" : ` style="text-align:${alignment}"`
  return `<${tag}${style}>${inline(text.replace(/\\\|/g, "|"))}</${tag}>`
}

function tableToHtml(table: Table): string {
  const row = (tag: "th" | "td", cells: string[]) =>
    `<tr>${cells.map((text, column) => cell(tag, text, table.alignments[column])).join("")}</tr>`

  const [header, ...body] = table.rows
  // No `<tbody>` at all when there are no rows, rather than an empty one.
  const rows =
    body.length === 0 ? "" : `<tbody>${body.map((cells) => row("td", cells)).join("")}</tbody>`

  return `<table><thead>${row("th", header)}</thead>${rows}</table>`
}

export function markdownToHtml(markdown: string): string {
  const out: string[] = []
  const lines = escapeHtml(markdown).split("\n")

  let paragraph: string[] = []
  let list: string[] = []
  let fence: string[] | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    out.push(`<p>${inline(paragraph.join(" "))}</p>`)
    paragraph = []
  }
  const flushList = (): void => {
    if (list.length === 0) return
    out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`)
    list = []
  }

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]

    if (/^\s*(```|~~~)/.test(line)) {
      if (fence === null) {
        flushParagraph()
        flushList()
        fence = []
      } else {
        out.push(`<pre><code>${fence.join("\n")}</code></pre>`)
        fence = null
      }
      continue
    }

    if (fence !== null) {
      fence.push(line)
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const item = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (item !== null) {
      flushParagraph()
      list.push(item[1])
      continue
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph()
      flushList()
      out.push("<hr>")
      continue
    }

    /*
     * Last of the block constructs, so a heading, a list item or a rule that
     * happens to contain a pipe stays what it is.
     *
     * The run of lines from here that all contain a pipe, and `parseTable`
     * decides. One condition does three jobs, which is why there are no others:
     * a line with no pipe makes a run of nothing, so `a` over `---` stays a
     * paragraph and a rule rather than becoming a one-column table; a blank
     * line has no pipe either, so it ends a run without being checked for; and
     * a run `parseTable` refuses falls through to the paragraph below, which is
     * what makes a sentence containing a pipe harmless.
     */
    let end = at
    while (end < lines.length && lines[end].includes("|")) end += 1

    const table = parseTable(lines.slice(at, end))
    if (table !== null) {
      flushParagraph()
      flushList()
      out.push(tableToHtml(table))
      at = end - 1
      continue
    }

    if (line.trim() === "") {
      flushParagraph()
      flushList()
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  // An unclosed fence still exports: the writing matters more than the syntax.
  if (fence !== null) out.push(`<pre><code>${fence.join("\n")}</code></pre>`)
  flushParagraph()
  flushList()

  return out.join("\n")
}

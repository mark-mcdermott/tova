/**
 * Markdown to HTML for export. Deliberately small and its own thing rather than
 * a renderer dependency: Tova only needs what its editor already writes, and a
 * general converter would be a large library for a single button.
 *
 * Everything is escaped before any markup is added, so a note containing HTML
 * exports as the text it is rather than as markup — a note is prose, not a
 * document someone else authored.
 */

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

  for (const line of lines) {
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

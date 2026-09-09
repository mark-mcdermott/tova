import { escapeHtml, markdownToHtml } from "./markdownToHtml"

/**
 * The printable page for a note. Its own function so it can be read and tested
 * without an Electron window: the printing is Chromium's problem, but what goes
 * on the page is ours.
 *
 * Print styles rather than screen ones — the app's glass and photograph mean
 * nothing on paper, and the point of a PDF is that it reads like a document.
 */
export function notePdfPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font: 11pt/1.7 -apple-system, system-ui, sans-serif; margin: 0; color: #17141f }
  h1 { font-size: 22pt; margin: 0 0 1.5rem }
  h2 { font-size: 16pt; margin: 2rem 0 0.75rem }
  h3, h4, h5, h6 { font-size: 12pt; margin: 1.5rem 0 0.5rem }
  /* A line stranded alone at a page break reads as a mistake. */
  p, li { orphans: 2; widows: 2 }
  pre { background: #f4f3f7; padding: 0.75rem 1rem; border-radius: 6px;
        white-space: pre-wrap; overflow-wrap: anywhere;
        font: 9.5pt/1.5 ui-monospace, Menlo, monospace }
  code { font: 0.92em ui-monospace, Menlo, monospace }
  img { max-width: 100% }
  hr { border: none; border-top: 1px solid #d8d5e0; margin: 2rem 0 }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${markdownToHtml(body)}
</body></html>`
}

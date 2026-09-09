import { BrowserWindow, dialog } from "electron"
import { readFile, writeFile } from "fs/promises"
import { parseFrontMatter } from "../shared/frontMatter"
import { notePdfPage } from "../shared/notePdfPage"
import { requireLocation, notePath } from "./vault"

/**
 * Writes the note to a location the user picks. Exported verbatim, front matter
 * included — the file that lands on disk is the file Tova has, which keeps the
 * export lossless and re-importable.
 */
export async function exportNoteMarkdown(id: string): Promise<string | null> {
  const location = requireLocation(id)
  const contents = await readFile(notePath(location), "utf-8")

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export note",
    defaultPath: location.filename,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  })

  if (canceled || filePath === undefined) return null

  await writeFile(filePath, contents, "utf-8")
  return filePath
}

/**
 * A PDF, printed by Chromium itself rather than by a layout library — Electron
 * already carries a browser, and adding a renderer for a single button would be
 * a large dependency for a small feature.
 *
 * The page is loaded from a data URL into an offscreen window so nothing about
 * it can reach the app: no preload, no node, and it never becomes visible.
 */
export async function exportNotePdf(id: string): Promise<string | null> {
  const location = requireLocation(id)
  const raw = await readFile(notePath(location), "utf-8")
  const { data, body } = parseFrontMatter(raw)

  const title =
    typeof data.title === "string" && data.title.trim() !== ""
      ? data.title
      : location.filename.replace(/\.md$/, "")

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export as PDF",
    defaultPath: location.filename.replace(/\.md$/, ".pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  })

  if (canceled || filePath === undefined) return null

  const page = notePdfPage(title, body)

  const window = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, javascript: false }
  })

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 }
    })
    await writeFile(filePath, pdf)
    return filePath
  } finally {
    // Whatever happened, the offscreen window does not outlive the export.
    window.destroy()
  }
}

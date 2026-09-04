import { dialog } from "electron"
import { readFile, writeFile } from "fs/promises"
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

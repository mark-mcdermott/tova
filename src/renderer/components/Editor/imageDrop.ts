import { EditorView } from "@codemirror/view"
import { assetLink } from "../../../shared/assets"

/** What the editor is willing to take from a drop or a paste. */
function imagesIn(transfer: DataTransfer | null): File[] {
  if (transfer === null) return []
  return Array.from(transfer.files).filter((file) => file.type.startsWith("image/"))
}

/** A file name makes a serviceable alt text; brackets would break the link. */
export function altTextFor(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "")
}

/**
 * Images land on a line of their own. Text already on the drop line is left
 * intact, with a blank line between it and the first picture.
 */
export function composeInsertion(links: string[], textBefore: string): string {
  const prefix = textBefore.trim() === "" ? "" : "\n\n"
  return `${prefix}${links.join("\n\n")}\n`
}

async function insertImages(
  view: EditorView,
  noteId: string,
  files: File[],
  at: number
): Promise<void> {
  const links: string[] = []

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const stored = await window.tova.images.save(file.name, bytes)
    links.push(`![${altTextFor(file.name)}](${assetLink(noteId, stored)})`)
  }

  // The document can have moved on while the writes were in flight, so the
  // insertion point is clamped rather than trusted.
  const pos = Math.min(at, view.state.doc.length)
  const line = view.state.doc.lineAt(pos)
  const insert = composeInsertion(links, line.text.slice(0, pos - line.from))

  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length }
  })
}

/**
 * Dropping or pasting an image copies it into the vault and leaves markdown
 * behind — the file is the note's, not a link to wherever it came from.
 */
export function imageDrop(
  getNoteId: () => string | null,
  onError: (message: string | null) => void
) {
  const store = (view: EditorView, noteId: string, files: File[], at: number): void => {
    // A fresh attempt clears whatever the last one complained about.
    onError(null)
    insertImages(view, noteId, files, at).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : String(error))
    })
  }

  return EditorView.domEventHandlers({
    dragover(event) {
      // dataTransfer's contents are unreadable mid-drag, but its types are not.
      if (!event.dataTransfer?.types.includes("Files")) return false
      event.preventDefault()
      return true
    },

    drop(event, view) {
      const files = imagesIn(event.dataTransfer)
      const noteId = getNoteId()
      if (files.length === 0 || noteId === null) return false

      event.preventDefault()
      const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.doc.length
      store(view, noteId, files, at)
      return true
    },

    paste(event, view) {
      const files = imagesIn(event.clipboardData)
      const noteId = getNoteId()
      if (files.length === 0 || noteId === null) return false

      // A screenshot off the clipboard takes the same route; without this it
      // arrives as nothing at all.
      event.preventDefault()
      store(view, noteId, files, view.state.selection.main.head)
      return true
    }
  })
}

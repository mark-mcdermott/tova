import { DragEvent, useState } from "react"
import { NoteSummary } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { canDrop, DropTarget } from "./dragDrop"

/**
 * Drop behaviour for one sidebar target. The dragged note is read from the
 * store rather than the drag payload because dataTransfer is deliberately
 * unreadable during dragover — the payload only becomes visible on drop, which
 * is too late to decide whether to accept.
 */
export function useDropTarget(
  target: DropTarget,
  onAccept: (note: NoteSummary, event: DragEvent) => void
) {
  const draggingNoteId = useNotesStore((state) => state.draggingNoteId)
  const notes = useNotesStore((state) => state.notes)
  const [over, setOver] = useState(false)

  const note =
    draggingNoteId === null
      ? null
      : (notes.find((candidate) => candidate.id === draggingNoteId) ?? null)

  const allowed = note !== null && canDrop(note, target)

  return {
    isDropActive: over && allowed,
    dropHandlers: {
      onDragOver: (event: DragEvent) => {
        if (!allowed) return
        // Without preventDefault the browser refuses the drop entirely.
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        setOver(false)
        if (!allowed || note === null) return
        event.preventDefault()
        onAccept(note, event)
      }
    }
  }
}

import { NoteSummary } from "../../../shared/types"
import { displayName } from "../../../shared/noteName"
import { useNotesStore } from "../../stores/notesStore"

interface NoteRowProps {
  note: NoteSummary
}

export function NoteRow({ note }: NoteRowProps) {
  const activeId = useNotesStore((state) => state.activeId)
  const open = useNotesStore((state) => state.open)
  const trash = useNotesStore((state) => state.trash)
  const restore = useNotesStore((state) => state.restore)
  const destroy = useNotesStore((state) => state.destroy)

  const isTrashed = note.section === "trash"
  const label = note.title.trim() === "" ? "untitled" : displayName(note.title)

  return (
    <div className={`note-row${note.id === activeId ? " is-active" : ""}`}>
      <button type="button" className="note-row-open" onClick={() => open(note.id)}>
        {label}
      </button>

      <div className="note-row-actions">
        {isTrashed ? (
          <>
            <button
              type="button"
              title="Restore"
              aria-label={`Restore ${label}`}
              onClick={() => restore(note.id)}
            >
              ⤺
            </button>
            <button
              type="button"
              className="is-destructive"
              title="Delete permanently"
              aria-label={`Permanently delete ${label}`}
              onClick={() => destroy(note.id)}
            >
              ✕
            </button>
          </>
        ) : (
          <button
            type="button"
            title="Move to Trash"
            aria-label={`Move ${label} to Trash`}
            onClick={() => trash(note.id)}
          >
            ⌫
          </button>
        )}
      </div>
    </div>
  )
}

import { NoteSummary } from "../../../shared/types"
import { displayName } from "../../../shared/noteName"
import { useNotesStore } from "../../stores/notesStore"
import { Menu, MenuItem } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"

interface NoteRowProps {
  note: NoteSummary
}

export function NoteRow({ note }: NoteRowProps) {
  const activeId = useNotesStore((state) => state.activeId)
  const open = useNotesStore((state) => state.open)
  const trash = useNotesStore((state) => state.trash)
  const restore = useNotesStore((state) => state.restore)
  const destroy = useNotesStore((state) => state.destroy)
  const requestTitleFocus = useNotesStore((state) => state.requestTitleFocus)

  const menu = useContextMenu()
  const isTrashed = note.section === "trash"
  const label = note.title.trim() === "" ? "untitled" : displayName(note.title)

  // Renaming has no sidebar widget by design: it opens the note and puts the
  // caret in its title, which is the field the filename follows.
  async function rename() {
    await open(note.id)
    requestTitleFocus()
  }

  const items: MenuItem[] = isTrashed
    ? [
        { label: "Restore", onSelect: () => restore(note.id) },
        "separator",
        {
          label: "Delete permanently",
          destructive: true,
          onSelect: () => destroy(note.id)
        }
      ]
    : [
        { label: "Rename", onSelect: rename },
        "separator",
        {
          label: "Delete → Trash",
          destructive: true,
          onSelect: () => trash(note.id)
        }
      ]

  return (
    <div
      className={`note-row${note.id === activeId ? " is-active" : ""}`}
      onContextMenu={menu.open}
    >
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

      {menu.position !== null && (
        <Menu x={menu.position.x} y={menu.position.y} items={items} onClose={menu.close} />
      )}
    </div>
  )
}

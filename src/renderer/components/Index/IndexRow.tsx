import { useState } from "react"
import { NoteSummary } from "../../../shared/types"
import { formatEditedAgo } from "../../../shared/date"
import { useNotesStore } from "../../stores/notesStore"
import { Menu, MenuItem } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { ConfirmDialog } from "../Popup/ConfirmDialog"
import { NOTE_MIME } from "../Sidebar/dragDrop"
import { Icon } from "../Sidebar/icons"
import { useTooltip } from "../../useTooltip"

interface IndexRowProps {
  note: NoteSummary
  /** Present on search results: why this note is in the list. */
  match?: { where: "title" | "tag" | "body"; snippet: string | null }
}

/**
 * One note on an index page. Carries everything the sidebar's note row used to:
 * it is the drag source for filing a note into a folder, it holds the same
 * context menu, and its trash sits under the pointer rather than on the row.
 */
export function IndexRow({ note, match }: IndexRowProps) {
  const open = useNotesStore((state) => state.open)
  const trash = useNotesStore((state) => state.trash)
  const restore = useNotesStore((state) => state.restore)
  const destroy = useNotesStore((state) => state.destroy)
  const toggleFavorite = useNotesStore((state) => state.toggleFavorite)
  const requestTitleFocus = useNotesStore((state) => state.requestTitleFocus)
  const setDraggingNote = useNotesStore((state) => state.setDraggingNote)

  const menu = useContextMenu()
  const [asking, setAsking] = useState<"trash" | "destroy" | null>(null)
  const tip = useTooltip()
  const isTrashed = note.section === "trash"
  const label = note.title.trim() === "" ? "Untitled" : note.title

  // Renaming has no widget of its own by design: it opens the note and puts the
  // caret in its title, which is the field the filename follows.
  async function rename() {
    await open(note.id)
    requestTitleFocus()
  }

  const items: MenuItem[] = isTrashed
    ? [
        { label: "Restore", onSelect: () => restore(note.id) },
        "separator",
        { label: "Delete permanently", destructive: true, onSelect: () => destroy(note.id) }
      ]
    : [
        { label: "Rename", onSelect: rename },
        "separator",
        { label: "Delete → Trash", destructive: true, onSelect: () => setAsking("trash") }
      ]

  return (
    <li
      className="index-item"
      onContextMenu={menu.open}
      draggable={!isTrashed}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData(NOTE_MIME, note.id)
        setDraggingNote(note.id)
      }}
      onDragEnd={() => setDraggingNote(null)}
    >
      <button type="button" className="index-row" onClick={() => void open(note.id)}>
        <span className="index-row-text">
          <span className="index-row-title">{label}</span>
          {/* Only on a body hit: repeating the title back under the title, or
              the tag that is already visible, tells the reader nothing. */}
          {match?.where === "body" && match.snippet !== null && (
            <span className="index-row-snippet">{match.snippet}</span>
          )}
        </span>
        <span className="index-row-meta">{formatEditedAgo(note.updatedAt)}</span>
      </button>

      {/* After the edited time, with the trash after it: the row reads title,
          when, then what you can do about it. */}
      <button
        type="button"
        className={`index-star${note.favorite ? " is-on" : ""}`}
        {...tip(note.favorite ? "Remove from favourites" : "Add to favourites")}
        aria-label={note.favorite ? `Unfavourite ${label}` : `Favourite ${label}`}
        aria-pressed={note.favorite}
        onClick={() => void toggleFavorite(note.id)}
      >
        <Icon name="star" className="index-star-icon" />
      </button>

      <div className="index-actions">
        {isTrashed ? (
          <>
            <button
              type="button"
              {...tip("Restore")}
              aria-label={`Restore ${label}`}
              onClick={() => void restore(note.id)}
            >
              ⤺
            </button>
            <button
              type="button"
              className="is-destructive"
              {...tip("Delete permanently")}
              aria-label={`Permanently delete ${label}`}
              onClick={() => setAsking("destroy")}
            >
              ✕
            </button>
          </>
        ) : (
          <button
            type="button"
            {...tip("Move to Trash — hold Shift to skip asking")}
            aria-label={`Move ${label} to Trash`}
            onClick={(event) => {
              // Trash is recoverable, so a held Shift may skip the asking. The
              // permanent delete above is not, and keeps its confirm whatever
              // is held down — a stray Shift should never cost a note outright.
              if (event.shiftKey) void trash(note.id)
              else setAsking("trash")
            }}
          >
            <Icon name="trash" className="row-action-icon" />
          </button>
        )}
      </div>

      {menu.position !== null && (
        <Menu x={menu.position.x} y={menu.position.y} items={items} onClose={menu.close} />
      )}

      {asking === "trash" && (
        <ConfirmDialog
          title={`Move "${label}" to Trash?`}
          body="It stays in Trash until you empty it, and can be restored from there."
          confirmLabel="Move to Trash"
          destructive
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null)
            void trash(note.id)
          }}
        />
      )}

      {asking === "destroy" && (
        <ConfirmDialog
          title={`Delete "${label}" permanently?`}
          body="This removes the file from the vault. It cannot be undone from inside Tova — only a snapshot would bring it back."
          confirmLabel="Delete permanently"
          destructive
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null)
            void destroy(note.id)
          }}
        />
      )}
    </li>
  )
}

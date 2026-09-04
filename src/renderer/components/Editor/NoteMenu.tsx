import { useState } from "react"
import { Note } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Menu, MenuItem } from "../Popup/Menu"

interface NoteMenuProps {
  note: Note
  x: number
  y: number
  onClose: () => void
}

/**
 * The editor's `...` menu. Contents depend on the note: a daily note has no
 * Move (its filename is its date), and a trashed note offers recovery instead
 * of editing actions.
 */
export function NoteMenu({ note, x, y, onClose }: NoteMenuProps) {
  const folders = useNotesStore((state) => state.folders)
  const trash = useNotesStore((state) => state.trash)
  const restore = useNotesStore((state) => state.restore)
  const destroy = useNotesStore((state) => state.destroy)
  const moveNote = useNotesStore((state) => state.moveNote)
  const exportNote = useNotesStore((state) => state.exportNote)
  const requestTitleFocus = useNotesStore((state) => state.requestTitleFocus)

  const [choosingFolder, setChoosingFolder] = useState(false)

  const exportItem: MenuItem = {
    label: "Export .md",
    onSelect: () => exportNote(note.id)
  }

  function mainItems(): MenuItem[] {
    if (note.section === "trash") {
      return [
        { label: "Restore", onSelect: () => restore(note.id) },
        "separator",
        exportItem,
        "separator",
        {
          label: "Delete permanently",
          destructive: true,
          onSelect: () => destroy(note.id)
        }
      ]
    }

    const items: MenuItem[] = [{ label: "Rename", onSelect: requestTitleFocus }]

    if (note.section === "notes") {
      items.push({
        label: "Move to…",
        keepOpen: true,
        onSelect: () => setChoosingFolder(true)
      })
    }

    items.push("separator", exportItem, "separator", {
      label: "Delete → Trash",
      destructive: true,
      onSelect: () => trash(note.id)
    })

    return items
  }

  function folderItems(): MenuItem[] {
    const targets: MenuItem[] = []

    if (note.folder !== null) {
      targets.push({ label: "Notes", onSelect: () => moveNote(note.id, "notes", null) })
    }

    for (const folder of folders) {
      if (folder === note.folder) continue
      targets.push({
        label: folder,
        onSelect: () => moveNote(note.id, "notes", folder)
      })
    }

    if (targets.length === 0) {
      return [{ label: "Nowhere else to move it", onSelect: () => undefined }]
    }
    return targets
  }

  return (
    <Menu
      x={x}
      y={y}
      items={choosingFolder ? folderItems() : mainItems()}
      onClose={onClose}
    />
  )
}

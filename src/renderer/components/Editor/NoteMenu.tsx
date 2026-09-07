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

    // Everything but a daily note can move; a daily note's filename is its date.
    // Trashed notes never reach here — they take the recovery branch above.
    if (note.section !== "daily") {
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

    if (note.folder !== null || note.section !== "notes") {
      targets.push({ label: "Notes", onSelect: () => moveNote(note.id, "notes", null) })
    }

    // The flat sections beside Notes, minus wherever the note already is.
    for (const [section, label] of [
      ["ideas", "Ideas"],
      ["journal", "Journal"],
      ["archive", "Archive"]
    ] as const) {
      if (note.section === section) continue
      targets.push({ label, onSelect: () => moveNote(note.id, section, null) })
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

  return <Menu x={x} y={y} items={choosingFolder ? folderItems() : mainItems()} onClose={onClose} />
}

import { useState } from "react"
import { Note } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Menu, MenuItem } from "../Popup/Menu"
import { useBlogsStore } from "../../stores/blogsStore"

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

  const deletePost = useBlogsStore((state) => state.deletePost)

  const [choosingFolder, setChoosingFolder] = useState(false)
  const [choosingDelete, setChoosingDelete] = useState(false)

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

    // A daily note's filename is its date, and a post's belongs to the blog it
    // came from — moving either would break what the filename is for.
    if (note.section !== "daily" && note.section !== "posts") {
      items.push({
        label: "Move to…",
        keepOpen: true,
        onSelect: () => setChoosingFolder(true)
      })
    }

    // A post lives on a blog as well as here, so deleting it asks which.
    items.push(
      "separator",
      exportItem,
      "separator",
      note.section === "posts"
        ? {
            label: "Delete…",
            destructive: true,
            keepOpen: true,
            onSelect: () => setChoosingDelete(true)
          }
        : { label: "Delete → Trash", destructive: true, onSelect: () => trash(note.id) }
    )

    return items
  }

  function deleteItems(): MenuItem[] {
    const filename = note.id.split("/").pop() ?? ""

    return [
      {
        label: "Delete here only",
        onSelect: () => {
          if (note.folder !== null) void deletePost(note.folder, filename, false)
        }
      },
      {
        label: "Delete here and on the blog",
        destructive: true,
        onSelect: () => {
          if (note.folder !== null) void deletePost(note.folder, filename, true)
        }
      }
    ]
  }

  function folderItems(): MenuItem[] {
    const targets: MenuItem[] = []

    if (note.folder !== null || note.section !== "notes") {
      targets.push({ label: "Notes", onSelect: () => moveNote(note.id, "notes", null) })
    }

    // The flat sections beside Notes, minus wherever the note already is.
    for (const [section, label] of [
      ["ideas", "Ideas"],
      ["journal", "Journal"]
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

  const items = choosingFolder ? folderItems() : choosingDelete ? deleteItems() : mainItems()

  return <Menu x={x} y={y} items={items} onClose={onClose} />
}

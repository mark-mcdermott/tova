import { useState } from "react"
import { Note } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Menu, MenuItem } from "../Popup/Menu"
import { useBlogsStore } from "../../stores/blogsStore"
import { noteHome } from "./breadcrumb"

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
  const toggleFavorite = useNotesStore((state) => state.toggleFavorite)
  const destroy = useNotesStore((state) => state.destroy)
  const moveNote = useNotesStore((state) => state.moveNote)
  const exportNote = useNotesStore((state) => state.exportNote)
  const exportPdf = useNotesStore((state) => state.exportPdf)
  const requestTitleFocus = useNotesStore((state) => state.requestTitleFocus)
  const showIndex = useNotesStore((state) => state.showIndex)

  const deletePost = useBlogsStore((state) => state.deletePost)

  const [choosingFolder, setChoosingFolder] = useState(false)
  const [choosingDelete, setChoosingDelete] = useState(false)

  /**
   * Deleting the note you are reading leaves you reading it, which is a strange
   * place to be — the breadcrumb quietly changes to Trash and nothing else
   * does. Going up to where it lived is the honest answer: that place still
   * exists, and it is the one the trail was already pointing at.
   *
   * Where it lived, not where it went. A note on its way to Trash came from
   * somewhere, and that is the listing worth being on.
   */
  function leave(): void {
    showIndex(noteHome(note))
  }

  const exportItem: MenuItem = {
    label: "Export .md",
    onSelect: () => exportNote(note.id)
  }

  const exportPdfItem: MenuItem = {
    label: "Export .pdf",
    onSelect: () => exportPdf(note.id)
  }

  function mainItems(): MenuItem[] {
    if (note.section === "trash") {
      return [
        { label: "Restore", onSelect: () => restore(note.id) },
        "separator",
        exportItem,
        exportPdfItem,
        "separator",
        {
          label: "Delete permanently",
          destructive: true,
          onSelect: () => {
            void destroy(note.id)
            leave()
          }
        }
      ]
    }

    const items: MenuItem[] = [
      { label: "Rename", onSelect: requestTitleFocus },
      {
        label: note.favorite ? "Remove from favourites" : "Add to favourites",
        onSelect: () => void toggleFavorite(note.id)
      }
    ]

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
      exportPdfItem,
      "separator",
      note.section === "posts"
        ? {
            label: "Delete…",
            destructive: true,
            keepOpen: true,
            onSelect: () => setChoosingDelete(true)
          }
        : {
            label: "Delete → Trash",
            destructive: true,
            onSelect: () => {
              void trash(note.id)
              leave()
            }
          }
    )

    return items
  }

  function deleteItems(): MenuItem[] {
    const filename = note.id.split("/").pop() ?? ""

    return [
      {
        label: "Delete here only",
        onSelect: () => {
          if (note.folder === null) return
          void deletePost(note.folder, filename, false)
          leave()
        }
      },
      {
        label: "Delete here and on the blog",
        destructive: true,
        onSelect: () => {
          if (note.folder === null) return
          void deletePost(note.folder, filename, true)
          leave()
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

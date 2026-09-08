import { DragEvent, MouseEvent, useState } from "react"
import { NoteSummary } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Disclosure } from "./Disclosure"
import { FolderNameInput } from "./FolderNameInput"
import { Menu, MenuItem } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { useDropTarget } from "./useDropTarget"
import { useBlogsStore } from "../../stores/blogsStore"
import { blogLabel } from "../../../shared/blogConfig"

interface FolderTreeProps {
  notes: NoteSummary[]
  folders: string[]
}

interface FolderMenuState {
  folder: string
  x: number
  y: number
}

interface TrashConfirmState {
  note: NoteSummary
  x: number
  y: number
}

/**
 * A folder row. Its own component because each one needs a drop target of its
 * own, and hooks cannot be called from inside a map.
 */
function FolderRow({
  folder,
  notes,
  onContextMenu,
  onMove
}: {
  folder: string
  notes: NoteSummary[]
  onContextMenu: (event: MouseEvent) => void
  onMove: (note: NoteSummary, folder: string) => void
}) {
  const showIndex = useNotesStore((state) => state.showIndex)
  const { isDropActive, dropHandlers } = useDropTarget({ kind: "folder", folder }, (note) =>
    onMove(note, folder)
  )

  return (
    <Disclosure
      sectionKey={`folder:${folder}`}
      label={folder}
      count={notes.length}
      icon="folder"
      depth={2}
      onActivate={() => showIndex({ kind: "folder", folder })}
      onContextMenu={onContextMenu}
      dropHandlers={dropHandlers}
      isDropActive={isDropActive}
    />
  )
}

export function FolderTree({ notes, folders }: FolderTreeProps) {
  const showIndex = useNotesStore((state) => state.showIndex)
  const createNote = useNotesStore((state) => state.createNote)
  const createFolder = useNotesStore((state) => state.createFolder)
  const renameFolder = useNotesStore((state) => state.renameFolder)
  const deleteFolder = useNotesStore((state) => state.deleteFolder)
  const openToday = useNotesStore((state) => state.openToday)
  const creatingFolder = useNotesStore((state) => state.creatingFolder)
  const setCreatingFolder = useNotesStore((state) => state.setCreatingFolder)

  const moveNote = useNotesStore((state) => state.moveNote)
  const trash = useNotesStore((state) => state.trash)

  const dailyMenu = useContextMenu()
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [trashConfirm, setTrashConfirm] = useState<TrashConfirmState | null>(null)

  // Trashing is the one drop that destroys the arrangement, so it asks first.
  const notesRoot = useDropTarget({ kind: "notesRoot" }, (note) => moveNote(note.id, "notes", null))
  const dailyDrop = useDropTarget({ kind: "daily" }, () => undefined)
  const trashDrop = useDropTarget({ kind: "trash" }, (note, event: DragEvent) =>
    setTrashConfirm({ note, x: event.clientX, y: event.clientY })
  )

  const inSection = (section: NoteSummary["section"]) =>
    notes.filter((note) => note.section === section)

  const blogs = useBlogsStore((state) => state.blogs)
  const posts = inSection("posts")
  const notesSection = inSection("notes")
  const daily = inSection("daily")
  const trashed = inSection("trash")

  // Flat sections beside Notes: no folders, so each is a list plus a way in.
  const flatSections = [
    { key: "ideas", label: "Ideas", icon: "ideas" },
    { key: "journal", label: "Journal", icon: "journal" }
  ] as const

  function openFolderMenu(folder: string) {
    return (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setFolderMenu({ folder, x: event.clientX, y: event.clientY })
    }
  }

  function folderMenuItems(folder: string): MenuItem[] {
    const count = notesSection.filter((note) => note.folder === folder).length

    return [
      { label: "New note", onSelect: () => createNote("notes", folder) },
      { label: "New folder", onSelect: () => setCreatingFolder(true) },
      "separator",
      { label: "Rename", onSelect: () => setRenaming(folder) },
      {
        // Says what it will do: nothing here is destroyed outright.
        label: count === 0 ? "Delete folder" : `Delete folder (${count} → Trash)`,
        destructive: true,
        onSelect: () => deleteFolder(folder)
      }
    ]
  }

  return (
    <>
      {/* Blogs sit as peers of Notes, each holding the posts synced from it. */}
      {blogs.map((blog) => {
        const held = posts.filter((note) => note.folder === blog.name)
        return (
          <Disclosure
            key={blog.id}
            sectionKey={`blog:${blog.name}`}
            label={blogLabel(blog)}
            count={held.length}
            icon="posts"
            depth={1}
            onActivate={() => showIndex({ kind: "blog", blog: blog.name })}
          />
        )
      })}

      <Disclosure
        sectionKey="notes"
        label="Notes"
        count={notesSection.length}
        icon="notes"
        depth={1}
        onActivate={() => showIndex({ kind: "section", section: "notes" })}
        dropHandlers={notesRoot.dropHandlers}
        isDropActive={notesRoot.isDropActive}
      />

      {/* Always shown rather than unfolded: a folder is a destination beside
          Notes, not a drawer inside it. */}
      {folders.map((folder) =>
        renaming === folder ? (
          <FolderNameInput
            key={folder}
            initialValue={folder}
            onSubmit={(name) => {
              setRenaming(null)
              if (name !== folder) renameFolder(folder, name)
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <FolderRow
            key={folder}
            folder={folder}
            notes={notesSection.filter((note) => note.folder === folder)}
            onContextMenu={openFolderMenu(folder)}
            onMove={(note, destination) => moveNote(note.id, "notes", destination)}
          />
        )
      )}

      {creatingFolder && (
        <FolderNameInput
          onSubmit={(name) => {
            setCreatingFolder(false)
            createFolder(name)
          }}
          onCancel={() => setCreatingFolder(false)}
        />
      )}

      <Disclosure
        sectionKey="daily"
        label="Daily"
        count={daily.length}
        icon="daily"
        depth={1}
        onContextMenu={dailyMenu.open}
        onActivate={() => showIndex({ kind: "section", section: "daily" })}
        dropHandlers={dailyDrop.dropHandlers}
        isDropActive={dailyDrop.isDropActive}
      />

      {flatSections.map(({ key, label, icon }) => {
        const held = inSection(key)
        return (
          <Disclosure
            key={key}
            sectionKey={key}
            label={label}
            count={held.length}
            icon={icon}
            depth={1}
            onActivate={() => showIndex({ kind: "section", section: key })}
          />
        )
      })}

      <Disclosure
        sectionKey="trash"
        label="Trash"
        count={trashed.length}
        icon="trash"
        depth={1}
        onActivate={() => showIndex({ kind: "section", section: "trash" })}
        dropHandlers={trashDrop.dropHandlers}
        isDropActive={trashDrop.isDropActive}
      />

      {dailyMenu.position !== null && (
        <Menu
          x={dailyMenu.position.x}
          y={dailyMenu.position.y}
          items={[{ label: "Open Today's Note", onSelect: openToday }]}
          onClose={dailyMenu.close}
        />
      )}

      {folderMenu !== null && (
        <Menu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderMenuItems(folderMenu.folder)}
          onClose={() => setFolderMenu(null)}
        />
      )}

      {trashConfirm !== null && (
        <Menu
          x={trashConfirm.x}
          y={trashConfirm.y}
          items={[
            {
              label: `Move ${trashConfirm.note.title || "note"} to Trash`,
              destructive: true,
              onSelect: () => trash(trashConfirm.note.id)
            }
          ]}
          onClose={() => setTrashConfirm(null)}
        />
      )}
    </>
  )
}

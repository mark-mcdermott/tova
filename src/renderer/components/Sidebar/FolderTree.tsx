import { DragEvent, MouseEvent, ReactNode, useState } from "react"
import { NoteSummary } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Disclosure } from "./Disclosure"
import { NoteRow } from "./NoteRow"
import { FolderNameInput } from "./FolderNameInput"
import { Menu, MenuItem } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { useDropTarget } from "./useDropTarget"

interface FolderTreeProps {
  notes: NoteSummary[]
  folders: string[]
}

function NoteRows({ notes, depth }: { notes: NoteSummary[]; depth: number }) {
  if (notes.length === 0) return <p className="sidebar-empty">Nothing here yet</p>
  return (
    <>
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} depth={depth} />
      ))}
    </>
  )
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
  onMove,
  children
}: {
  folder: string
  notes: NoteSummary[]
  onContextMenu: (event: MouseEvent) => void
  onMove: (note: NoteSummary, folder: string) => void
  children: ReactNode
}) {
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
      onContextMenu={onContextMenu}
      dropHandlers={dropHandlers}
      isDropActive={isDropActive}
    >
      {children}
    </Disclosure>
  )
}

export function FolderTree({ notes, folders }: FolderTreeProps) {
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
  const notesRoot = useDropTarget({ kind: "notesRoot" }, (note) =>
    moveNote(note.id, "notes", null)
  )
  const dailyDrop = useDropTarget({ kind: "daily" }, () => undefined)
  const trashDrop = useDropTarget({ kind: "trash" }, (note, event: DragEvent) =>
    setTrashConfirm({ note, x: event.clientX, y: event.clientY })
  )

  const inSection = (section: NoteSummary["section"]) =>
    notes.filter((note) => note.section === section)

  const notesSection = inSection("notes")
  const loose = notesSection.filter((note) => note.folder === null)
  const daily = inSection("daily")
  const trashed = inSection("trash")

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
    <Disclosure sectionKey="folders" label="FOLDERS" variant="section">
      <Disclosure
        sectionKey="notes"
        label="Notes"
        count={notesSection.length}
        icon="notes"
        depth={1}
        dropHandlers={notesRoot.dropHandlers}
        isDropActive={notesRoot.isDropActive}
      >
        {folders.map((folder) => {
          const inFolder = notesSection.filter((note) => note.folder === folder)

          if (renaming === folder) {
            return (
              <FolderNameInput
                key={folder}
                initialValue={folder}
                onSubmit={(name) => {
                  setRenaming(null)
                  if (name !== folder) renameFolder(folder, name)
                }}
                onCancel={() => setRenaming(null)}
              />
            )
          }

          return (
            <FolderRow
              key={folder}
              folder={folder}
              notes={inFolder}
              onContextMenu={openFolderMenu(folder)}
              onMove={(note, destination) => moveNote(note.id, "notes", destination)}
            >
              <NoteRows notes={inFolder} depth={3} />
            </FolderRow>
          )
        })}

        {creatingFolder && (
          <FolderNameInput
            onSubmit={(name) => {
              setCreatingFolder(false)
              createFolder(name)
            }}
            onCancel={() => setCreatingFolder(false)}
          />
        )}

        <NoteRows notes={loose} depth={2} />

        <button type="button" className="sidebar-add" onClick={() => createNote("notes", null)}>
          + New note
        </button>
      </Disclosure>

      <Disclosure
        sectionKey="daily"
        label="Daily"
        count={daily.length}
        icon="daily"
        depth={1}
        onContextMenu={dailyMenu.open}
        dropHandlers={dailyDrop.dropHandlers}
        isDropActive={dailyDrop.isDropActive}
      >
        <NoteRows notes={daily} depth={2} />
      </Disclosure>

      <Disclosure
        sectionKey="trash"
        label="Trash"
        count={trashed.length}
        icon="trash"
        depth={1}
        dropHandlers={trashDrop.dropHandlers}
        isDropActive={trashDrop.isDropActive}
      >
        <NoteRows notes={trashed} depth={2} />
      </Disclosure>

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
    </Disclosure>
  )
}

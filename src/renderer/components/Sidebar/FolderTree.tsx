import { DragEvent, Fragment, MouseEvent, useState } from "react"
import { NoteSummary } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { useRail } from "../../useRail"
import { railKey, visibleSections } from "../../../shared/sections"
import { Disclosure } from "./Disclosure"
import { FolderNameInput } from "./FolderNameInput"
import { Menu, MenuItem } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { useDropTarget } from "./useDropTarget"

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
  const openListing = useNotesStore((state) => state.openListing)
  const foldOthers = useNotesStore((state) => state.foldOthers)
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
      onActivate={() => {
        foldOthers("notes")
        void openListing({ kind: "folder", folder })
      }}
      onContextMenu={onContextMenu}
      dropHandlers={dropHandlers}
      isDropActive={isDropActive}
    />
  )
}

export function FolderTree({ notes, folders }: FolderTreeProps) {
  const showIndex = useNotesStore((state) => state.showIndex)
  const openListing = useNotesStore((state) => state.openListing)
  const createNote = useNotesStore((state) => state.createNote)
  const createFolder = useNotesStore((state) => state.createFolder)
  const renameFolder = useNotesStore((state) => state.renameFolder)
  const deleteFolder = useNotesStore((state) => state.deleteFolder)
  const openToday = useNotesStore((state) => state.openToday)
  const creatingFolder = useNotesStore((state) => state.creatingFolder)
  const setCreatingFolder = useNotesStore((state) => state.setCreatingFolder)

  const moveNote = useNotesStore((state) => state.moveNote)
  const foldOthers = useNotesStore((state) => state.foldOthers)
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

  const posts = inSection("posts")
  const notesSection = inSection("notes")

  // The rail is configuration now: what exists, what it is called, in what
  // order. Blogs are entries in the same list, so one can sit anywhere rather
  // than in a fixed block above the sections. Notes and Trash still take drop
  // targets of their own, and Notes still carries its folders.
  const sections = visibleSections(useRail())

  const dropFor = (id: string) =>
    id === "notes" ? notesRoot : id === "daily" ? dailyDrop : id === "trash" ? trashDrop : null

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
      {sections.map((section) => {
        const key = railKey(section)

        // A blog holds the posts synced from it, and takes no drop target: its
        // posts arrive from the repository, not from the reader dragging one in.
        if (section.kind === "blog") {
          return (
            <Disclosure
              key={key}
              sectionKey={key}
              label={section.label}
              count={posts.filter((note) => note.folder === section.id).length}
              icon={section.icon}
              depth={1}
              onActivate={() => {
                foldOthers(key)
                showIndex({ kind: "blog", blog: section.id })
              }}
            />
          )
        }

        const held = inSection(section.id)
        const drop = dropFor(section.id)

        return (
          <Fragment key={key}>
            <Disclosure
              sectionKey={section.id}
              label={section.label}
              count={held.length}
              icon={section.icon}
              depth={1}
              onActivate={() => {
                foldOthers(section.id)
                void openListing({ kind: "section", section: section.id })
              }}
              onContextMenu={section.id === "daily" ? dailyMenu.open : undefined}
              dropHandlers={drop?.dropHandlers}
              isDropActive={drop?.isDropActive}
            >
              {/* Folders live under Notes and fold away with it. Each is still
                  a destination in its own right: clicking Notes shows them and
                  opens its index, clicking it again puts them away.

                  Undefined rather than an empty fragment when there is nothing
                  to hold: a drawer with nothing in it should have no caret, and
                  `children` being defined at all is what draws one. */}
              {section.id === "notes" && (folders.length > 0 || creatingFolder) ? (
                <>
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
                </>
              ) : undefined}
            </Disclosure>
          </Fragment>
        )
      })}

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

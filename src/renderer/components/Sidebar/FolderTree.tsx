import { MouseEvent, useState } from "react"
import { NoteSummary } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { Disclosure } from "./Disclosure"
import { NoteRow } from "./NoteRow"
import { Menu } from "../Popup/Menu"

interface FolderTreeProps {
  notes: NoteSummary[]
  folders: string[]
}

function EmptyHint({ children }: { children: string }) {
  return <p className="sidebar-empty">{children}</p>
}

function NoteRows({ notes }: { notes: NoteSummary[] }) {
  if (notes.length === 0) return <EmptyHint>Nothing here yet</EmptyHint>
  return (
    <>
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} />
      ))}
    </>
  )
}

export function FolderTree({ notes, folders }: FolderTreeProps) {
  const createNote = useNotesStore((state) => state.createNote)
  const openToday = useNotesStore((state) => state.openToday)
  const [dailyMenu, setDailyMenu] = useState<{ x: number; y: number } | null>(null)

  function openDailyMenu(event: MouseEvent) {
    event.preventDefault()
    setDailyMenu({ x: event.clientX, y: event.clientY })
  }

  const inSection = (section: NoteSummary["section"]) =>
    notes.filter((note) => note.section === section)

  const notesSection = inSection("notes")
  const loose = notesSection.filter((note) => note.folder === null)
  const daily = inSection("daily")
  const trashed = inSection("trash")

  return (
    <Disclosure label="FOLDERS" defaultOpen variant="section">
      <Disclosure label="Notes" count={notesSection.length} defaultOpen>
        {folders.map((folder) => {
          const inFolder = notesSection.filter((note) => note.folder === folder)
          return (
            <Disclosure key={folder} label={folder} count={inFolder.length}>
              <NoteRows notes={inFolder} />
            </Disclosure>
          )
        })}

        <NoteRows notes={loose} />

        <button
          type="button"
          className="sidebar-add"
          onClick={() => createNote("notes", null)}
        >
          + New note
        </button>
      </Disclosure>

      <Disclosure
        label="Daily"
        count={daily.length}
        defaultOpen
        onContextMenu={openDailyMenu}
      >
        <NoteRows notes={daily} />
      </Disclosure>

      {dailyMenu !== null && (
        <Menu
          x={dailyMenu.x}
          y={dailyMenu.y}
          items={[{ label: "Open Today's Note", onSelect: openToday }]}
          onClose={() => setDailyMenu(null)}
        />
      )}

      <Disclosure label="Trash" count={trashed.length}>
        <NoteRows notes={trashed} />
      </Disclosure>
    </Disclosure>
  )
}

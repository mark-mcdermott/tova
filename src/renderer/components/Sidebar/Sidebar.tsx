import { useNotesStore } from "../../stores/notesStore"
import { FolderTree } from "./FolderTree"
import { TagList } from "./TagList"

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M11.4 1.9a1.5 1.5 0 0 1 2.1 2.1l-7.6 7.6-2.8.7.7-2.8 7.6-7.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Sidebar() {
  const notes = useNotesStore((state) => state.notes)
  const folders = useNotesStore((state) => state.folders)
  const loading = useNotesStore((state) => state.loading)
  const error = useNotesStore((state) => state.error)
  const createNote = useNotesStore((state) => state.createNote)

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <span className="wordmark">Tova</span>
        <button
          type="button"
          className="icon-button"
          title="New note"
          aria-label="New note"
          onClick={() => createNote("notes", null)}
        >
          <PencilIcon />
        </button>
      </header>

      <div className="sidebar-scroll">
        {error !== null && <p className="sidebar-error">{error}</p>}
        {loading ? (
          <p className="sidebar-empty">Loading…</p>
        ) : (
          <>
            <FolderTree notes={notes} folders={folders} />
            <TagList notes={notes} />
          </>
        )}
      </div>
    </aside>
  )
}

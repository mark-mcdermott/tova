import { useNotesStore } from "../../stores/notesStore"
import { FolderTree } from "./FolderTree"
import { TagList } from "./TagList"
import { Menu } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { Icon } from "./icons"
import avatarUrl from "../../assets/avatar.jpg"

export function Sidebar() {
  const notes = useNotesStore((state) => state.notes)
  const folders = useNotesStore((state) => state.folders)
  const loading = useNotesStore((state) => state.loading)
  const error = useNotesStore((state) => state.error)
  const createNote = useNotesStore((state) => state.createNote)
  const setCreatingFolder = useNotesStore((state) => state.setCreatingFolder)
  const menu = useContextMenu()

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <span className="wordmark">Tova</span>

        <button
          type="button"
          className="icon-button icon-button-framed"
          title="New note"
          aria-label="New note"
          onClick={() => createNote("notes", null)}
        >
          <Icon name="compose" className="header-icon" />
        </button>
      </header>

      <div className="sidebar-scroll" onContextMenu={menu.open}>
        {error !== null && <p className="sidebar-error">{error}</p>}
        {loading ? (
          <p className="sidebar-empty">Loading…</p>
        ) : (
          <>
            <FolderTree notes={notes} folders={folders} />
            <hr className="sidebar-rule" />
            <TagList notes={notes} />
          </>
        )}
      </div>

      <footer className="sidebar-footer">
        <img className="sidebar-avatar" src={avatarUrl} alt="" />
        <span className="sidebar-user">Mark</span>

        {/* Static for now; Settings arrives in phase 12. */}
        <span className="sidebar-footer-cog" aria-hidden="true">
          <Icon name="cog" className="footer-icon" />
        </span>
      </footer>

      {menu.position !== null && (
        <Menu
          x={menu.position.x}
          y={menu.position.y}
          items={[
            { label: "New note", onSelect: () => createNote("notes", null) },
            { label: "New folder", onSelect: () => setCreatingFolder(true) }
          ]}
          onClose={menu.close}
        />
      )}
    </aside>
  )
}

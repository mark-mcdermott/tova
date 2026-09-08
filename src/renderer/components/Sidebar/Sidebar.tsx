import { useNotesStore } from "../../stores/notesStore"
import { FolderTree } from "./FolderTree"
import { TagList } from "./TagList"
import { Menu } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { Icon } from "./icons"
import { Wordmark } from "./Wordmark"
import bundledAvatar from "../../assets/avatar.jpg"
import { usePreferencesStore } from "../../stores/preferencesStore"

export function Sidebar() {
  const notes = useNotesStore((state) => state.notes)
  const folders = useNotesStore((state) => state.folders)
  const loading = useNotesStore((state) => state.loading)
  const error = useNotesStore((state) => state.error)
  const createNote = useNotesStore((state) => state.createNote)
  const setCreatingFolder = useNotesStore((state) => state.setCreatingFolder)
  const showSettings = useNotesStore((state) => state.showSettings)
  const displayName = usePreferencesStore((state) => state.preferences.displayName)
  const chosenAvatar = usePreferencesStore((state) => state.avatarUrl)
  const menu = useContextMenu()

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <Wordmark />

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
        {/* Distinct from the cog beside it: this one opens the Profile tab, so
            the two controls do not share an accessible name. */}
        <button
          type="button"
          className="sidebar-identity"
          title="Profile"
          aria-label="Profile"
          onClick={() => showSettings("profile")}
        >
          <img className="sidebar-avatar" src={chosenAvatar ?? bundledAvatar} alt="" />
          {displayName !== "" && <span className="sidebar-user">{displayName}</span>}
        </button>

        <button
          type="button"
          className="icon-button sidebar-footer-cog"
          title="Settings"
          aria-label="Settings"
          onClick={() => showSettings()}
        >
          <Icon name="cog" className="footer-icon" />
        </button>
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

import { useState } from "react"
import { useNotesStore } from "../../stores/notesStore"
import { FolderTree } from "./FolderTree"
import { TagList } from "./TagList"
import { Menu } from "../Popup/Menu"
import { useContextMenu } from "../Popup/useContextMenu"
import { composeTarget } from "../../../shared/composeTarget"
import { visibleSections } from "../../../shared/sections"
import { Icon } from "./icons"
import { Wordmark } from "./Wordmark"
import { Avatar } from "./Avatar"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { useTooltip } from "../../useTooltip"

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
  const view = useNotesStore((state) => state.view)
  const indexTarget = useNotesStore((state) => state.indexTarget)
  const active = useNotesStore((state) => state.active)
  const openToday = useNotesStore((state) => state.openToday)

  const showIndex = useNotesStore((state) => state.showIndex)
  const sections = usePreferencesStore((state) => state.preferences.sections)
  const [home] = visibleSections(sections)
  const runSearch = useNotesStore((state) => state.runSearch)
  const [query, setQuery] = useState("")

  const menu = useContextMenu()
  const tip = useTooltip()

  // The button writes where you are standing. Daily is the exception: its notes
  // are one a day and made for you, so it opens today's, creating it if the day
  // has none rather than making a second.
  async function compose() {
    const target = composeTarget(view, indexTarget, active)
    if (target === null) {
      await openToday()
      return
    }
    await createNote(target.section, target.folder)
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        {/* The mark is the way home: it opens whatever section sits at the top
            of the rail, which the reader chooses. */}
        <button
          type="button"
          className="wordmark-button"
          {...tip(home === undefined ? "Tova" : `Tova — open ${home.label}`)}
          aria-label={home === undefined ? "Tova" : `Tova — open ${home.label}`}
          disabled={home === undefined}
          onClick={() => {
            if (home !== undefined) showIndex({ kind: "section", section: home.id })
          }}
        >
          <Wordmark />
        </button>

        <button
          type="button"
          className="icon-button icon-button-framed"
          {...tip("New note")}
          aria-label="New note"
          onClick={() => void compose()}
        >
          <Icon name="compose" className="header-icon" />
        </button>
      </header>

      {/* Above the list rather than beside it: a field says what it is, where a
          lone magnifier would just be a symbol taking up the rail. */}
      <div className="sidebar-search">
        <Icon name="search" className="sidebar-search-icon" />
        <input
          type="search"
          className="sidebar-search-input"
          placeholder="Search notes…"
          aria-label="Search notes"
          value={query}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            if (next.trim() === "") return
            showIndex({ kind: "search", query: next })
            void runSearch(next)
          }}
        />
      </div>

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
          {...tip("Profile")}
          aria-label="Profile"
          onClick={() => showSettings("profile")}
        >
          <Avatar className="sidebar-avatar" src={chosenAvatar} name={displayName} />
          {displayName !== "" && <span className="sidebar-user">{displayName}</span>}
        </button>

        <button
          type="button"
          className="icon-button sidebar-footer-cog"
          {...tip("Settings")}
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

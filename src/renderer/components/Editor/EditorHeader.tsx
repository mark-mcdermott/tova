import { useEffect, useReducer, useRef } from "react"
import { Note } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { canGoBack, canGoForward } from "../../stores/history"
import { breadcrumbFor } from "./breadcrumb"
import { NoteMenu } from "./NoteMenu"
import { Icon } from "../Sidebar/icons"
import { formatEditedAgo } from "../../../shared/date"
import { useContextMenu } from "../Popup/useContextMenu"
import { EditorTags } from "./EditorTags"

interface EditorHeaderProps {
  note: Note
  title: string
  onTitleChange: (value: string) => void
  onTitleCommit: () => void
  onAddTag: (tag: string) => void
}

export function EditorHeader({
  note,
  title,
  onTitleChange,
  onTitleCommit,
  onAddTag
}: EditorHeaderProps) {
  const back = useNotesStore((state) => state.back)
  const forward = useNotesStore((state) => state.forward)
  const expandSection = useNotesStore((state) => state.expandSection)
  const toggleSidebar = useNotesStore((state) => state.toggleSidebar)
  const sidebarCollapsed = useNotesStore((state) => state.sidebarCollapsed)

  // Selecting booleans keeps this out of the re-render path for scroll updates,
  // which touch history on every frame.
  const hasBack = useNotesStore((state) => canGoBack(state.history))
  const hasForward = useNotesStore((state) => canGoForward(state.history))
  const focusTitleSeq = useNotesStore((state) => state.focusTitleSeq)
  const toggleFavorite = useNotesStore((state) => state.toggleFavorite)

  const menu = useContextMenu()

  // The edited time is derived, so it only moves when something re-renders.
  // A slow tick keeps it honest while a note sits open.
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [])
  const titleRef = useRef<HTMLInputElement>(null)
  const crumbs = breadcrumbFor(note)

  // Rename selects the existing title so typing replaces it outright.
  useEffect(() => {
    if (focusTitleSeq === 0) return
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [focusTitleSeq])

  function revealInSidebar(target: string) {
    if (sidebarCollapsed) toggleSidebar()
    if (target.startsWith("folder:")) expandSection("notes")
    expandSection(target)
  }

  return (
    <div className="editor-header">
      <nav className="editor-nav" aria-label="Note navigation">
        <button
          type="button"
          className="icon-button"
          title="Back"
          aria-label="Back"
          disabled={!hasBack}
          onClick={() => back()}
        >
          <Icon name="back" className="nav-icon" />
        </button>

        {/* Forward only earns its space once there is somewhere to go. */}
        {hasForward && (
          <button
            type="button"
            className="icon-button"
            title="Forward"
            aria-label="Forward"
            onClick={() => forward()}
          >
            <Icon name="back" className="nav-icon nav-icon-forward" />
          </button>
        )}

        <ol className="breadcrumb">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.target ?? "note"}-${index}`}>
              {crumb.target === null ? (
                <span className="breadcrumb-current">{crumb.label}</span>
              ) : (
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => revealInSidebar(crumb.target as string)}
                >
                  {crumb.label}
                </button>
              )}
            </li>
          ))}
        </ol>

        <div className="editor-nav-end">
          <span className="editor-edited">{formatEditedAgo(note.updatedAt)}</span>

          <button
            type="button"
            className={`icon-button editor-star${note.favorite ? " is-on" : ""}`}
            title={note.favorite ? "Remove from favourites" : "Add to favourites"}
            aria-label={note.favorite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={note.favorite}
            onClick={() => toggleFavorite(note.id)}
          >
            <Icon name="star" className="nav-icon" />
          </button>

          <button
            type="button"
            className="icon-button editor-menu-button"
            title="Note actions"
            aria-label="Note actions"
            aria-haspopup="menu"
            onClick={(event) => menu.open(event)}
          >
            <Icon name="more" className="nav-icon" />
          </button>
        </div>
      </nav>

      <input
        ref={titleRef}
        className="title-input"
        placeholder="Untitled"
        aria-label="Note title"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Tab" || event.key === "Enter") {
            event.preventDefault()
            onTitleCommit()
          }
        }}
      />

      <EditorTags tags={note.tags} onAddTag={onAddTag} />

      {menu.position !== null && (
        <NoteMenu note={note} x={menu.position.x} y={menu.position.y} onClose={menu.close} />
      )}
    </div>
  )
}

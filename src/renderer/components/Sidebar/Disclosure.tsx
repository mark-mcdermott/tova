import { DragEvent, MouseEvent, ReactNode } from "react"
import { useNotesStore } from "../../stores/notesStore"
import { Icon } from "./icons"
import { containerKeyOf } from "./sectionKey"

interface DisclosureProps {
  /** Key in the store's expanded map — also what breadcrumbs target. */
  sectionKey: string
  label: string
  count?: number
  variant?: "section" | "group"
  icon?: "notes" | "daily" | "ideas" | "journal" | "archive" | "posts" | "trash" | "folder"
  /** Nesting level, so a row can indent its text while its background does not. */
  depth?: number
  onContextMenu?: (event: MouseEvent) => void
  /** Drag handlers from useDropTarget, spread onto the header. */
  dropHandlers?: {
    onDragOver: (event: DragEvent) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent) => void
  }
  isDropActive?: boolean
  children: ReactNode
}

/**
 * The one collapsible primitive the sidebar uses. Open state lives in the store
 * rather than the component so breadcrumbs can reveal a section, and so folders
 * start collapsed on every launch with nothing persisted.
 */
export function Disclosure({
  sectionKey,
  label,
  count,
  variant = "group",
  icon,
  depth = 0,
  onContextMenu,
  dropHandlers,
  isDropActive = false,
  children
}: DisclosureProps) {
  const open = useNotesStore((state) => state.expanded[sectionKey] === true)
  const toggleSection = useNotesStore((state) => state.toggleSection)

  // The purple marks where the reader is, so it belongs on whatever directly
  // holds the open note — the folder if it is in one, the section otherwise.
  const isActive = useNotesStore((state) => containerKeyOf(state.active) === sectionKey)

  // A section with nothing in it has nothing to reveal, so it does not respond.
  // Notes still arrive through the compose control or the editor's Move menu.
  const empty = count === 0

  return (
    <div className={`disclosure disclosure-${variant}`}>
      <button
        type="button"
        className={`disclosure-header disclosure-header-${variant}${
          isDropActive ? " is-drop-active" : ""
        }${empty ? " is-empty" : ""}${isActive ? " is-active" : ""}`}
        data-depth={depth}
        {...dropHandlers}
        aria-expanded={empty ? undefined : open}
        aria-disabled={empty || undefined}
        onContextMenu={onContextMenu}
        onClick={() => {
          if (!empty) toggleSection(sectionKey)
        }}
      >
        {icon !== undefined && <Icon name={icon} />}
        <span className="disclosure-label">{label}</span>
        {/* An empty section says so by being empty; a nought adds nothing. */}
        {count !== undefined && count > 0 && <span className="disclosure-count">{count}</span>}
      </button>

      {open && !empty && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

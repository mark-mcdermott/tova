import { DragEvent, MouseEvent, ReactNode } from "react"
import { useNotesStore } from "../../stores/notesStore"
import { Icon } from "./icons"
import { containerKeyOf } from "./sectionKey"
import { indexKey } from "../../../shared/indexTarget"

interface DisclosureProps {
  /** Key in the store's expanded map — also what breadcrumbs target. */
  sectionKey: string
  label: string
  count?: number
  variant?: "section" | "group"
  icon?: "notes" | "daily" | "ideas" | "journal" | "posts" | "trash" | "folder"
  /** Nesting level, so a row can indent its text while its background does not. */
  depth?: number
  /**
   * Given instead of a fold: the row becomes a destination, opening an index in
   * the body rather than unfolding a list in the rail.
   */
  onActivate?: () => void
  onContextMenu?: (event: MouseEvent) => void
  /** Drag handlers from useDropTarget, spread onto the header. */
  dropHandlers?: {
    onDragOver: (event: DragEvent) => void
    onDragLeave: () => void
    onDrop: (event: DragEvent) => void
  }
  isDropActive?: boolean
  /** Not needed by a destination row, which never unfolds. */
  children?: ReactNode
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
  onActivate,
  onContextMenu,
  dropHandlers,
  isDropActive = false,
  children
}: DisclosureProps) {
  const open = useNotesStore((state) => state.expanded[sectionKey] === true)
  const toggleSection = useNotesStore((state) => state.toggleSection)

  // The purple marks where the reader is, so it belongs on whatever directly
  // holds the open note — the folder if it is in one, the section otherwise.
  const isActive = useNotesStore((state) =>
    state.view === "index" && state.indexTarget !== null
      ? indexKey(state.indexTarget) === sectionKey
      : containerKeyOf(state.active) === sectionKey
  )

  // A section with nothing in it has nothing to reveal, so it does not respond.
  // Notes still arrive through the compose control or the editor's Move menu.
  const empty = count === 0

  return (
    <div className={`disclosure disclosure-${variant}`}>
      <button
        type="button"
        className={`disclosure-header disclosure-header-${variant}${
          isDropActive ? " is-drop-active" : ""
        }${empty && onActivate === undefined ? " is-empty" : ""}${
          isActive ? " is-active" : ""
        }`}
        data-depth={depth}
        {...dropHandlers}
        aria-expanded={onActivate !== undefined || empty ? undefined : open}
        aria-disabled={onActivate === undefined && empty ? true : undefined}
        onContextMenu={onContextMenu}
        onClick={() => {
          if (onActivate !== undefined) {
            onActivate()
            return
          }
          if (!empty) toggleSection(sectionKey)
        }}
      >
        {icon !== undefined && <Icon name={icon} />}
        <span className="disclosure-label">{label}</span>
        {/* An empty section says so by being empty; a nought adds nothing. */}
        {count !== undefined && count > 0 && <span className="disclosure-count">{count}</span>}
      </button>

      {onActivate === undefined && open && !empty && (
        <div className="disclosure-body">{children}</div>
      )}
    </div>
  )
}

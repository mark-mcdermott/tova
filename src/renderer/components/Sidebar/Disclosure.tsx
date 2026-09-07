import { DragEvent, MouseEvent, ReactNode } from "react"
import { useNotesStore } from "../../stores/notesStore"
import { Icon } from "./icons"

interface DisclosureProps {
  /** Key in the store's expanded map — also what breadcrumbs target. */
  sectionKey: string
  label: string
  count?: number
  variant?: "section" | "group"
  icon?: "notes" | "daily" | "trash" | "folder"
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

  return (
    <div className={`disclosure disclosure-${variant}`}>
      <button
        type="button"
        className={`disclosure-header${isDropActive ? " is-drop-active" : ""}`}
        data-depth={depth}
        {...dropHandlers}
        aria-expanded={open}
        onContextMenu={onContextMenu}
        onClick={() => toggleSection(sectionKey)}
      >
        {icon !== undefined && <Icon name={icon} />}
        <span className="disclosure-label">{label}</span>
        {count !== undefined && <span className="disclosure-count">{count}</span>}
      </button>

      {open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

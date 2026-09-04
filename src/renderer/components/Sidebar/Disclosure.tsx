import { MouseEvent, ReactNode } from "react"
import { useNotesStore } from "../../stores/notesStore"

interface DisclosureProps {
  /** Key in the store's expanded map — also what breadcrumbs target. */
  sectionKey: string
  label: string
  count?: number
  variant?: "section" | "group"
  onContextMenu?: (event: MouseEvent) => void
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
  onContextMenu,
  children
}: DisclosureProps) {
  const open = useNotesStore((state) => state.expanded[sectionKey] === true)
  const toggleSection = useNotesStore((state) => state.toggleSection)

  return (
    <div className={`disclosure disclosure-${variant}`}>
      <button
        type="button"
        className="disclosure-header"
        aria-expanded={open}
        onContextMenu={onContextMenu}
        onClick={() => toggleSection(sectionKey)}
      >
        <span className={`disclosure-arrow${open ? " is-open" : ""}`} aria-hidden="true">
          ▸
        </span>
        <span className="disclosure-label">{label}</span>
        {count !== undefined && <span className="disclosure-count">{count}</span>}
      </button>

      {open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

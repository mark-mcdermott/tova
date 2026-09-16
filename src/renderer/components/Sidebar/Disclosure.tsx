import { DragEvent, MouseEvent, ReactNode } from "react"
import { useNotesStore } from "../../stores/notesStore"
import { ChevronIcon, Icon } from "./icons"
import { containerKeyOf } from "./sectionKey"
import { indexKey } from "../../../shared/indexTarget"
import { SectionIcon } from "../../../shared/sections"

interface DisclosureProps {
  /** Key in the store's expanded map — also what breadcrumbs target. */
  sectionKey: string
  label: string
  count?: number
  variant?: "section" | "group"
  icon?: SectionIcon | "folder"
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
 * The one collapsible primitive the sidebar uses.
 *
 * A row can be a destination, a fold, or both. Notes is both: clicking it opens
 * its index, and the caret beside it hides the folders underneath — which is
 * why the caret is its own control rather than the row's click. Making the row
 * itself toggle would have cost the only way to reach the Notes index.
 *
 * Open state lives in the store rather than the component, so breadcrumbs can
 * reveal a section and so the whole map can be written to preferences in one
 * piece and read back at launch.
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

  /*
   * Whether there is a drawer, which is whether anything was put in it — not
   * whether the section holds notes. Notes with folders and no loose notes
   * counts nought and still has five rows to hide.
   */
  const folds = children !== undefined

  return (
    <div className={`disclosure disclosure-${variant}`}>
      <div className={`disclosure-row${folds ? " has-fold" : ""}`}>
        {/* The slot is there whether or not it holds a caret: it is exactly the
            padding the header used to carry, so a row that folds and a row
            that cannot keep their labels in the same place. */}
        {folds ? (
          <button
            type="button"
            className={`disclosure-fold${open ? " is-open" : ""}`}
            data-depth={depth}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
            onClick={() => toggleSection(sectionKey)}
          >
            <ChevronIcon direction="right" />
          </button>
        ) : (
          <span className="disclosure-fold is-empty" data-depth={depth} aria-hidden="true" />
        )}
        <button
          type="button"
          className={`disclosure-header disclosure-header-${variant}${
            isDropActive ? " is-drop-active" : ""
          }${empty && onActivate === undefined ? " is-empty" : ""}${isActive ? " is-active" : ""}`}
          data-depth={depth}
          {...dropHandlers}
          aria-disabled={onActivate === undefined && empty ? true : undefined}
          onContextMenu={onContextMenu}
          onClick={() => {
            if (onActivate !== undefined) {
              onActivate()
              return
            }
            if (folds) toggleSection(sectionKey)
          }}
        >
          {icon !== undefined && <Icon name={icon} />}
          <span className="disclosure-label">{label}</span>
          {/* An empty section says so by being empty; a nought adds nothing. */}
          {count !== undefined && count > 0 && <span className="disclosure-count">{count}</span>}
        </button>
      </div>

      {folds && open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

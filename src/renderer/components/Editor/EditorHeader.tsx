import { Note } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { canGoBack, canGoForward } from "../../stores/history"
import { breadcrumbFor } from "./breadcrumb"

interface EditorHeaderProps {
  note: Note
  title: string
  onTitleChange: (value: string) => void
  onTitleCommit: () => void
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EditorHeader({
  note,
  title,
  onTitleChange,
  onTitleCommit
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

  const crumbs = breadcrumbFor(note)

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
          <ChevronIcon direction="left" />
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
            <ChevronIcon direction="right" />
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
      </nav>

      <input
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
    </div>
  )
}

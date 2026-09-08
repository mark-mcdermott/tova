import { useNotesStore } from "../../stores/notesStore"
import {
  INDEX_SORTS,
  IndexSort,
  IndexTarget,
  indexNotes,
  indexTitle,
  tagCounts
} from "../../../shared/indexTarget"
import { IndexRow } from "./IndexRow"

/**
 * The listing behind a section, a folder or a tag. The sidebar names places;
 * this is where their contents get room to be sorted and read.
 */
export function IndexPage() {
  const target = useNotesStore((state) => state.indexTarget)
  const notes = useNotesStore((state) => state.notes)
  const sort = useNotesStore((state) => state.indexSort)
  const setIndexSort = useNotesStore((state) => state.setIndexSort)
  const showIndex = useNotesStore((state) => state.showIndex)

  if (target === null) return null

  const title = indexTitle(target)
  const parent =
    target.kind === "folder"
      ? { label: "Notes", target: { kind: "section", section: "notes" } as IndexTarget }
      : target.kind === "tag"
        ? { label: "Tags", target: { kind: "tags" } as IndexTarget }
        : null
  const rows = indexNotes(notes, target, sort)
  const tags = target.kind === "tags" ? tagCounts(notes) : []

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <nav className="editor-nav" aria-label="Index navigation">
          <ol className="breadcrumb">
            {/* A crumb only where there is somewhere above to go: repeating the
                heading back at the reader tells them nothing. */}
            {parent !== null && (
              <li>
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => showIndex(parent.target)}
                >
                  {parent.label}
                </button>
              </li>
            )}
            <li>
              <span className="breadcrumb-current">{title}</span>
            </li>
          </ol>

          {target.kind !== "tags" && (
            <div className="editor-nav-end">
              <label className="index-sort">
                <span className="index-sort-label">Sort</span>
                <select
                  className="index-sort-select"
                  aria-label="Sort by"
                  value={sort}
                  onChange={(event) => setIndexSort(event.target.value as IndexSort)}
                >
                  {INDEX_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </nav>

        <h1 className="index-heading">{title}</h1>
      </div>

      <div className="index-body">
        {target.kind === "tags" ? (
          tags.length === 0 ? (
            <p className="index-empty">No tags yet. Writing #something in a note makes one.</p>
          ) : (
            <ul className="index-list">
              {tags.map(({ tag, count }) => (
                <li key={tag}>
                  <button
                    type="button"
                    className="index-row"
                    onClick={() => showIndex({ kind: "tag", tag })}
                  >
                    <span className="index-row-title">#{tag}</span>
                    <span className="index-row-meta">
                      {count} {count === 1 ? "note" : "notes"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <p className="index-empty">Nothing here yet.</p>
        ) : (
          <ul className="index-list">
            {rows.map((note) => (
              <IndexRow key={note.id} note={note} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

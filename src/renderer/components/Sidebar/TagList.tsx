import { NoteSummary } from "../../../shared/types"
import { tagCounts } from "../../../shared/indexTarget"
import { useNotesStore } from "../../stores/notesStore"

interface TagListProps {
  notes: NoteSummary[]
}

/**
 * Always open, unlike the sections above it: the tags are the shortest list in
 * the rail and the one most worth seeing at a glance. The heading opens an
 * index of every tag; a row opens an index of that one.
 */
export function TagList({ notes }: TagListProps) {
  const tags = tagCounts(notes)
  const showIndex = useNotesStore((state) => state.showIndex)
  const target = useNotesStore((state) => state.indexTarget)
  const onIndex = useNotesStore((state) => state.view === "index")

  const showing = (tag: string): boolean =>
    onIndex && target?.kind === "tag" && target.tag.toLowerCase() === tag.toLowerCase()

  return (
    <div className="disclosure disclosure-section">
      <button
        type="button"
        className={`disclosure-header disclosure-header-section${
          onIndex && target?.kind === "tags" ? " is-active" : ""
        }`}
        data-depth={0}
        onClick={() => showIndex({ kind: "tags" })}
      >
        <span className="disclosure-label">TAGS</span>
      </button>

      <div className="disclosure-body">
        {tags.length === 0 ? (
          <p className="sidebar-empty">No tags yet</p>
        ) : (
          tags.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              className={`tag-row${showing(tag) ? " is-active" : ""}`}
              onClick={() => showIndex({ kind: "tag", tag })}
            >
              <span className="tag-row-name">
                <span className="tag-row-hash">#</span>
                {tag}
              </span>
              <span className="disclosure-count">{count}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

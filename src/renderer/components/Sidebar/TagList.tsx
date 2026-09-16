import { NoteSummary } from "../../../shared/types"
import { tagCounts } from "../../../shared/indexTarget"
import { useNotesStore } from "../../stores/notesStore"

interface TagListProps {
  notes: NoteSummary[]
}

/**
 * Always open, unlike the sections above it: the tags are the shortest list in
 * the rail and the one most worth seeing at a glance.
 *
 * The heading is a label and not a control. It used to open an index of every
 * tag, which is a page listing the same words that are already on screen
 * directly underneath it.
 */
export function TagList({ notes }: TagListProps) {
  const tags = tagCounts(notes)
  const showIndex = useNotesStore((state) => state.showIndex)
  const foldOthers = useNotesStore((state) => state.foldOthers)
  const target = useNotesStore((state) => state.indexTarget)
  const onIndex = useNotesStore((state) => state.view === "index")

  const showing = (tag: string): boolean =>
    onIndex && target?.kind === "tag" && target.tag.toLowerCase() === tag.toLowerCase()

  return (
    <div className="disclosure disclosure-section">
      <h2 className="tag-list-heading">TAGS</h2>

      <div className="disclosure-body">
        {tags.length === 0 ? (
          <p className="sidebar-empty">No tags yet</p>
        ) : (
          tags.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              className={`tag-row${showing(tag) ? " is-active" : ""}`}
              onClick={() => {
                // A tag is nobody's drawer, so every one of them shuts.
                foldOthers(null)
                showIndex({ kind: "tag", tag })
              }}
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

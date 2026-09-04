import { NoteSummary } from "../../../shared/types"
import { Disclosure } from "./Disclosure"

interface TagListProps {
  notes: NoteSummary[]
}

/** A note carrying the same tag twice still counts once — tags are per note. */
function countTags(notes: NoteSummary[]): [string, number][] {
  const counts = new Map<string, number>()

  for (const note of notes) {
    if (note.section === "trash") continue
    for (const tag of note.tags) {
      const key = tag.toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function TagList({ notes }: TagListProps) {
  const tags = countTags(notes)

  return (
    <Disclosure sectionKey="tags" label="TAGS" variant="section">
      {tags.length === 0 ? (
        <p className="sidebar-empty">No tags yet</p>
      ) : (
        tags.map(([tag, count]) => (
          <div key={tag} className="tag-row">
            <span className="tag-row-name">
              <span className="tag-row-hash">#</span>
              {tag}
            </span>
            <span className="disclosure-count">{count}</span>
          </div>
        ))
      )}
    </Disclosure>
  )
}

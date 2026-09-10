import { useEffect, useState } from "react"
import { useNotesStore } from "../../stores/notesStore"
import {
  INDEX_SORTS,
  SEARCH_SORTS,
  IndexSort,
  IndexTarget,
  indexKey,
  indexNotes,
  indexTitle,
  tagCounts
} from "../../../shared/indexTarget"
import { IndexRow } from "./IndexRow"
import { showsTrail } from "../Editor/breadcrumb"
import { HistoryNav } from "../Editor/HistoryNav"
import { ConfirmDialog } from "../Popup/ConfirmDialog"
import { NOTHING_SELECTED, afterClick, prune } from "../../../shared/rangeSelect"
import { useRail } from "../../useRail"
import { railLabel } from "../../../shared/sections"

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
  const searchHits = useNotesStore((state) => state.searchHits)
  const searchSort = useNotesStore((state) => state.searchSort)
  const setSearchSort = useNotesStore((state) => state.setSearchSort)
  const searching = useNotesStore((state) => state.searching)
  const trash = useNotesStore((state) => state.trash)
  const destroy = useNotesStore((state) => state.destroy)

  const [selection, setSelection] = useState(NOTHING_SELECTED)
  const [asking, setAsking] = useState(false)
  const rail = useRail()

  // A listing you have left is not one you are still picking rows out of.
  const where = target === null ? null : indexKey(target)
  useEffect(() => {
    setSelection(NOTHING_SELECTED)
    setAsking(false)
  }, [where])

  // Escape lets go of a selection without having to click into empty space,
  // which on a full list there may not be any of.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelection(NOTHING_SELECTED)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  if (target === null) return null

  const title = indexTitle(target, rail)
  const parent =
    target.kind === "folder"
      ? {
          label: railLabel(rail, "section", "notes"),
          target: { kind: "section", section: "notes" } as IndexTarget
        }
      : target.kind === "tag"
        ? { label: "Tags", target: { kind: "tags" } as IndexTarget }
        : null
  const trail = parent === null ? [{ label: title }] : [{ label: parent.label }, { label: title }]

  // Search answers from main, which is the only side that has the bodies; the
  // other indexes are a filter over what the renderer already holds.
  const onSearch = target.kind === "search"
  const rows = onSearch
    ? searchSort === "relevance"
      ? searchHits.map((hit) => hit.note)
      : indexNotes(
          searchHits.map((hit) => hit.note),
          { kind: "section", section: "notes" },
          searchSort
        )
    : indexNotes(notes, target, sort)
  const snippets = new Map(searchHits.map((hit) => [hit.note.id, hit.match]))

  // Rows come and go as notes are trashed; a selection holding ids that are no
  // longer listed would keep a bar on screen for nothing.
  const order = rows.map((note) => note.id)
  const picked = prune(selection, order)
  const onTrash = target.kind === "section" && target.section === "trash"

  async function removeSelected() {
    setAsking(false)
    // Sequentially: each one rewrites the vault's listing, and firing them all
    // at once would have them racing to describe the same directory.
    for (const id of picked.ids) {
      if (onTrash) await destroy(id)
      else await trash(id)
    }
    setSelection(NOTHING_SELECTED)
  }
  const tags = target.kind === "tags" ? tagCounts(notes) : []

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <nav className="editor-nav" aria-label="Index navigation">
          <HistoryNav />

          {/* Nothing at all where the trail would only repeat the heading under
              it. A folder or a tag has somewhere above to go and keeps both. */}
          {showsTrail(trail, title) && (
            <ol className="breadcrumb">
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
          )}

          {target.kind !== "tags" && (
            <div className="editor-nav-end">
              <label className="index-sort">
                <span className="index-sort-label">Sort by</span>
                <select
                  className="index-sort-select"
                  aria-label="Sort by"
                  value={onSearch ? searchSort : sort}
                  onChange={(event) => {
                    const next = event.target.value as IndexSort
                    if (onSearch) setSearchSort(next)
                    else setIndexSort(next)
                  }}
                >
                  {(onSearch ? SEARCH_SORTS : INDEX_SORTS).map((option) => (
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
          <p className="index-empty">
            {target.kind === "search"
              ? searching
                ? "Searching…"
                : "Nothing matches that."
              : "Nothing here yet."}
          </p>
        ) : (
          <ul className="index-list">
            {rows.map((note) => (
              <IndexRow
                key={note.id}
                note={note}
                match={snippets.get(note.id)}
                selected={picked.ids.includes(note.id)}
                onPick={(click) => {
                  const next = afterClick(picked, order, note.id, click)
                  if (next === null) {
                    // An ordinary click opens the note, and having done so it
                    // is not still picking rows out of the list behind it.
                    setSelection(NOTHING_SELECTED)
                    return false
                  }
                  setSelection(next)
                  return true
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Two or more: one row already has a trash of its own, and a bar for it
          would be a second way to do the same thing in the same place. */}
      {picked.ids.length > 1 && (
        <div className="index-bulk" role="group" aria-label="Selected notes">
          <span className="index-bulk-count">{picked.ids.length} selected</span>
          <button type="button" onClick={() => setSelection(NOTHING_SELECTED)}>
            Clear
          </button>
          <button type="button" className="is-destructive" onClick={() => setAsking(true)}>
            {onTrash ? "Delete permanently" : "Move to Trash"}
          </button>
        </div>
      )}

      {/* Always asked, even for the recoverable one. A single Shift-click can
          take out a dozen notes here, which is not the risk one row carries. */}
      {asking && (
        <ConfirmDialog
          title={
            onTrash
              ? `Delete ${picked.ids.length} notes permanently?`
              : `Move ${picked.ids.length} notes to Trash?`
          }
          body={
            onTrash
              ? "This removes the files from the vault. It cannot be undone from inside Tova — only a snapshot would bring them back."
              : "They stay in Trash until you empty it, and can be restored from there."
          }
          confirmLabel={onTrash ? "Delete permanently" : "Move to Trash"}
          destructive
          onCancel={() => setAsking(false)}
          onConfirm={() => void removeSelected()}
        />
      )}
    </div>
  )
}

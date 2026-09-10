import { KeyboardEvent, RefObject, useEffect, useRef, useState } from "react"
import { EditorView } from "@codemirror/view"
import { matchNearest, stepMatch } from "../../../shared/noteSearch"
import { matchesIn, showMatches } from "./searchHighlight"
import { useTooltip } from "../../useTooltip"
import { Icon } from "../Sidebar/icons"

interface NoteSearchProps {
  viewRef: RefObject<EditorView | null>
  onClose: () => void
  /** Bumped to re-open on a note that already had the bar up. */
  openSeq: number
}

/**
 * Searching the note you are reading, as against the sidebar's search across
 * every note.
 *
 * It holds no matches of its own: they are recomputed from the live document on
 * every keystroke, because the reader can type in the note while the bar is
 * open and a remembered list would be describing a document that has moved.
 */
export function NoteSearch({ viewRef, onClose, openSeq }: NoteSearchProps) {
  const [query, setQuery] = useState("")
  const [current, setCurrent] = useState(-1)
  const [total, setTotal] = useState(0)
  const fieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fieldRef.current?.focus()
    fieldRef.current?.select()
  }, [openSeq])

  function run(next: string) {
    setQuery(next)
    const view = viewRef.current
    if (view === null) return

    const matches = matchesIn(view, next)
    // From the caret, so a search begun halfway down a note carries on from
    // there rather than jumping back to the top.
    const at = matchNearest(matches, view.state.selection.main.head)

    setTotal(matches.length)
    setCurrent(at)
    showMatches(view, matches, at)
  }

  function step(direction: 1 | -1) {
    const view = viewRef.current
    if (view === null) return

    const matches = matchesIn(view, query)
    const at = stepMatch(current, matches.length, direction)

    setTotal(matches.length)
    setCurrent(at)
    showMatches(view, matches, at)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // The same key that opened it. Focus is in here while the bar is up, so
    // the editor's binding never sees this one.
    if ((event.metaKey || event.ctrlKey) && event.key === "f") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    }
    if (event.key === "Enter") {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    }
  }

  const tip = useTooltip()
  const found = query !== "" && total === 0

  return (
    <div className="note-search" role="search">
      <Icon name="search" className="note-search-icon" />
      <input
        ref={fieldRef}
        className="note-search-field"
        aria-label="Find in note"
        placeholder="Find in note…"
        value={query}
        onChange={(event) => run(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {/* Always here, silent until there is something to say. Appearing with
          the first keystroke would widen the bar under the reader's hands, and
          the count's own width would move it again as the numbers grow. */}
      <span className={`note-search-count${found ? " is-empty" : ""}`}>
        {query === "" ? "" : total === 0 ? "None" : `${current + 1} of ${total}`}
      </span>

      <button
        type="button"
        className="icon-button"
        {...tip("Previous (Shift+Enter)")}
        aria-label="Previous match"
        disabled={total === 0}
        onClick={() => step(-1)}
      >
        <Icon name="back" className="nav-icon" />
      </button>

      <button
        type="button"
        className="icon-button"
        {...tip("Next (Enter)")}
        aria-label="Next match"
        disabled={total === 0}
        onClick={() => step(1)}
      >
        <Icon name="back" className="nav-icon nav-icon-forward" />
      </button>

      <button
        type="button"
        className="icon-button"
        {...tip("Close (Esc)")}
        aria-label="Close find"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  )
}

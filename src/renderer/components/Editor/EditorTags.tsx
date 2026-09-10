import { KeyboardEvent, MouseEvent, RefObject, useEffect, useRef, useState } from "react"
import { TagOrigin } from "../../../shared/tags"

interface EditorTagsProps {
  tags: string[]
  /** Where each tag was written — see `tagOrigin`. */
  originOf: (tag: string) => TagOrigin
  /** Writes a tag into the prose. The row itself stores nothing. */
  onAddTag: (tag: string) => void
  /** Takes every occurrence of it back out again. */
  onRemoveTag: (tag: string) => void
  /** Opens the tag's listing, as clicking a pill in the prose does. */
  onOpenTag: (tag: string) => void
  /** The way in, so the title can hand focus straight to it on Tab. */
  addRef?: RefObject<HTMLButtonElement | null>
  /** Tab onwards, into the prose. */
  onLeaveForwards?: () => void
  /** Shift+Tab back, into the title. */
  onLeaveBackwards?: () => void
}

/**
 * The note's tags, between the title and the prose. The row carries a visible
 * way in rather than relying on the reader finding a bare strip: the band
 * between title and prose is 116px tall and the row is 26 of them, so an
 * unmarked target here is a target nobody hits.
 *
 * Adding writes `#tag` into the body, because that is where tags live, and
 * removing takes every occurrence back out — the row reads the text rather
 * than holding a list, so a tag left anywhere in the note puts the chip back.
 *
 * A tag inside a sentence loses its `#` and keeps its word, so removing one
 * never edits what the writer wrote. That was the objection to having this
 * control at all, and it is the whole of the answer to it.
 */
export function EditorTags({
  tags,
  originOf,
  onAddTag,
  onRemoveTag,
  onOpenTag,
  addRef,
  onLeaveForwards,
  onLeaveBackwards
}: EditorTagsProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  function openFromStrip(event: MouseEvent<HTMLDivElement>) {
    // Only the strip itself; a click that landed on a tag is not a miss.
    if (event.target === event.currentTarget) setAdding(true)
  }

  function commit() {
    if (draft.trim() !== "") onAddTag(draft)
    setDraft("")
    setAdding(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      commit()
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setDraft("")
      setAdding(false)
    }
  }

  return (
    <div className="editor-tags" aria-label="Tags" onClick={openFromStrip}>
      {/* The pill is the wrapper, not a control: a button holding a button is
          not something a browser will render, and the × has to be its own. */}
      {tags.map((tag) => (
        <span key={tag} className={`editor-tag is-${originOf(tag)}`}>
          <button
            type="button"
            className="editor-tag-open"
            aria-label={`Open ${tag}`}
            onClick={(event) => {
              event.stopPropagation()
              onOpenTag(tag)
            }}
          >
            <span className="editor-tag-hash">#</span>
            {tag}
          </button>
          <button
            type="button"
            className="editor-tag-remove"
            aria-label={`Remove ${tag}`}
            onClick={(event) => {
              event.stopPropagation()
              onRemoveTag(tag)
            }}
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          ref={inputRef}
          className="editor-tag-input"
          aria-label="New tag"
          placeholder="tag"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      ) : (
        <button
          ref={addRef}
          type="button"
          className="editor-tag-add"
          aria-label="Add tag"
          onClick={() => setAdding(true)}
          onKeyDown={(event) => {
            // The row sits between the title and the prose, and Tab walks that
            // way through it rather than out to the window's controls.
            if (event.key !== "Tab") return
            event.preventDefault()
            if (event.shiftKey) onLeaveBackwards?.()
            else onLeaveForwards?.()
          }}
        >
          + tag
        </button>
      )}
    </div>
  )
}

import { KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react"

interface EditorTagsProps {
  tags: string[]
  /** Writes a tag into the prose. The row itself stores nothing. */
  onAddTag: (tag: string) => void
}

/**
 * The note's tags, between the title and the prose. The row carries a visible
 * way in rather than relying on the reader finding a bare strip: the band
 * between title and prose is 116px tall and the row is 26 of them, so an
 * unmarked target here is a target nobody hits.
 *
 * Adding writes `#tag` into the body, because that is where tags live. They
 * are parsed out of the prose rather than stored, so removing one means
 * editing the sentence it sits in, which is the writer's job and not a
 * chip's.
 */
export function EditorTags({ tags, onAddTag }: EditorTagsProps) {
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
      {tags.map((tag) => (
        <span key={tag} className="editor-tag">
          <span className="editor-tag-hash">#</span>
          {tag}
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
          type="button"
          className="editor-tag-add"
          aria-label="Add tag"
          onClick={() => setAdding(true)}
        >
          + tag
        </button>
      )}
    </div>
  )
}

import { ReactNode, RefObject, useEffect, useReducer, useRef } from "react"
import { Note } from "../../../shared/types"
import { useNotesStore } from "../../stores/notesStore"
import { breadcrumbFor } from "./breadcrumb"
import { useRail } from "../../useRail"
import { AppearanceButton } from "./AppearanceButton"
import { IndexTarget, indexKey } from "../../../shared/indexTarget"
import { HistoryNav } from "./HistoryNav"
import { NoteMenu } from "./NoteMenu"
import { Icon } from "../Sidebar/icons"
import { formatEditedAgo } from "../../../shared/date"
import { useContextMenu } from "../Popup/useContextMenu"
import { EditorTags } from "./EditorTags"
import { tagOrigin } from "../../../shared/tags"
import { useTooltip } from "../../useTooltip"

interface EditorHeaderProps {
  note: Note
  title: string
  onTitleChange: (value: string) => void
  onTitleCommit: () => void
  /** The tag row's way in, owned by the editor so it can hand focus back. */
  tagAddRef: RefObject<HTMLButtonElement | null>
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onOpenTag: (tag: string) => void
  /** The find bar, drawn under the nav row when it is open. */
  find?: ReactNode
}

export function EditorHeader({
  note,
  title,
  onTitleChange,
  onTitleCommit,
  tagAddRef,
  onAddTag,
  onRemoveTag,
  onOpenTag,
  find
}: EditorHeaderProps) {
  const focusTitleSeq = useNotesStore((state) => state.focusTitleSeq)

  const showIndex = useNotesStore((state) => state.showIndex)

  const menu = useContextMenu()
  const rail = useRail()

  // The edited time is derived, so it only moves when something re-renders.
  // A slow tick keeps it honest while a note sits open.
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [])
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const tip = useTooltip()
  const crumbs = breadcrumbFor(note, rail)

  // Rename selects the existing title so typing replaces it outright.
  useEffect(() => {
    if (focusTitleSeq === 0) return
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [focusTitleSeq])

  return (
    <div className="editor-header">
      <nav className="editor-nav" aria-label="Note navigation">
        <HistoryNav />

        <ol className="breadcrumb">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.target === null ? "note" : indexKey(crumb.target)}-${index}`}>
              {crumb.target === null ? (
                <span className="breadcrumb-current">{crumb.label}</span>
              ) : (
                // Opens the listing. The sidebar marks where you are from the
                // index itself, so nothing has to reveal the row separately.
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => showIndex(crumb.target as IndexTarget)}
                >
                  {crumb.label}
                </button>
              )}
            </li>
          ))}
        </ol>

        <div className="editor-nav-end">
          <span className="editor-edited">{formatEditedAgo(note.updatedAt)}</span>

          <AppearanceButton />

          <button
            type="button"
            className="icon-button editor-menu-button"
            {...tip("Note actions")}
            aria-label="Note actions"
            aria-haspopup="menu"
            onClick={(event) => menu.open(event)}
          >
            <Icon name="more" className="nav-icon" />
          </button>
        </div>
      </nav>

      {find}

      {/*
        The box grows with its text, and the growing is the wrapper's doing.
        Both sit in one grid cell; the wrapper's ::after carries the same string
        and sets the row's height, which the textarea then stretches to fill.

        A textarea cannot size itself in CSS — `rows` is a fixed count and
        `field-sizing: content` is too new to lean on in a webview. The
        alternative is measuring `scrollHeight` and writing `style.height`,
        which is a layout read on every keystroke and an inline style besides.
      */}
      <div className="title-grow" data-title={title}>
        <textarea
          ref={titleRef}
          className="title-input"
          placeholder="Untitled"
          aria-label="Note title"
          rows={1}
          value={title}
          /*
            A title becomes a filename, so it stays one line of text however it
            is drawn. An input dropped newlines out of a paste by itself; a
            textarea keeps every one, so they are flattened here instead.
          */
          onChange={(event) => onTitleChange(event.target.value.replace(/\s*\n\s*/g, " "))}
          onKeyDown={(event) => {
            // Enter is done with the title — and in a textarea it would
            // otherwise put a newline in a string that becomes a filename.
            // Tab is the next thing along, which is the tag row, not the prose.
            if (event.key === "Enter") {
              event.preventDefault()
              onTitleCommit()
              return
            }
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault()
              tagAddRef.current?.focus()
            }
          }}
        />
      </div>

      <EditorTags
        tags={note.tags}
        originOf={(tag) => tagOrigin(note.manualTags, tag)}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onOpenTag={onOpenTag}
        addRef={tagAddRef}
        onLeaveForwards={onTitleCommit}
        onLeaveBackwards={() => titleRef.current?.focus()}
      />

      {menu.position !== null && (
        <NoteMenu note={note} x={menu.position.x} y={menu.position.y} onClose={menu.close} />
      )}
    </div>
  )
}

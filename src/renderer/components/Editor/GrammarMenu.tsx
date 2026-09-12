import { useEffect, useState, type RefObject } from "react"
import type { EditorView } from "@codemirror/view"
import { Menu, MenuItem } from "../Popup/Menu"
import { grammarNotes, noteAt, SPELLING, type GrammarNote } from "./grammar"

interface Opened {
  note: GrammarNote
  x: number
  y: number
}

/**
 * What the grammar checker meant, on right-click.
 *
 * The underline on its own says a sentence is wrong without saying how, which
 * is the least useful half of a grammar checker. `noteAt` was written for this
 * menu and then sat unused — right-clicking an underline did nothing at all.
 *
 * Spelling is deliberately not answered here. The checker reports it, but the
 * system's own menu is the better one: it knows the words the reader has
 * added, and it can add another. Leaving those clicks alone is what keeps one
 * right-click from opening two menus.
 */
export function GrammarMenu({ viewRef }: { viewRef: RefObject<EditorView | null> }) {
  const [opened, setOpened] = useState<Opened | null>(null)

  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      const view = viewRef.current
      if (view === null || !view.dom.contains(event.target as Node)) return

      // `false`, because grammar is a preference: with it off the field is
      // not in the editor's state at all and asking for it throws.
      const notes = view.state.field(grammarNotes, false)
      if (notes === undefined) return

      const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (position === null) return

      const note = noteAt(notes, position)
      if (note === null || note.kind === SPELLING) return

      setOpened({ note, x: event.clientX, y: event.clientY })
    }

    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [viewRef])

  if (opened === null) return null

  const { note } = opened

  function replace(word: string): void {
    const view = viewRef.current
    if (view === null) return

    // The note was read when the menu opened and the menu holds the focus, so
    // the span is still the one the reader clicked. Clamped anyway: a stale
    // range would otherwise throw rather than do nothing.
    const to = Math.min(note.to, view.state.doc.length)
    if (note.from >= to) return

    view.dispatch({ changes: { from: note.from, to, insert: word } })
    view.focus()
  }

  const suggestions: MenuItem[] = note.suggestions.map((word) => ({
    label: word,
    accent: true,
    onSelect: () => replace(word)
  }))

  return (
    <Menu
      x={opened.x}
      y={opened.y}
      items={[
        { label: note.message, onSelect: () => undefined },
        ...(suggestions.length === 0 ? [] : ["separator" as const, ...suggestions])
      ]}
      onClose={() => setOpened(null)}
    />
  )
}

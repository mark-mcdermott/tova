import { useEffect, useRef, useCallback } from "react"
import { EditorView, keymap, drawSelection, dropCursor } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import {
  markdown,
  markdownLanguage,
  markdownKeymap,
  pasteURLAsLink
} from "@codemirror/lang-markdown"
import { indentUnit } from "@codemirror/language"
import { markdownDecorations } from "./markdownDecorations"
import { formatKeymap } from "./formats"

interface UseCodeMirrorOptions {
  initialValue?: string
  onChange?: (value: string) => void
}

export function useCodeMirror({ initialValue = "", onChange }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // The view is built once, so the listener must reach the latest handler
  // through a ref rather than capturing the one present at mount.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          EditorView.lineWrapping,
          indentUnit.of("  "),
          markdown({ base: markdownLanguage }),
          markdownDecorations(),
          pasteURLAsLink,
          // Format shortcuts win over the markdown and default keymaps below.
          keymap.of([
            ...formatKeymap,
            ...markdownKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          })
        ]
      }),
      parent: container
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Recreating the view on prop changes would drop undo history and cursor
    // position; documents are swapped through setDoc instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getValue = useCallback((): string => {
    return viewRef.current?.state.doc.toString() ?? ""
  }, [])

  /** Replaces the whole document — used when switching notes. */
  const setDoc = useCallback((value: string): void => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: 0 }
    })
  }, [])

  return { containerRef, viewRef, getValue, setDoc }
}

import { useEffect, useRef, useCallback } from "react"
import { EditorView, keymap, drqwSelection, drawSelection } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { markdownDecorations } from "./markdownDecorations"

interface UseCodeMirrorOptions {
  initialValue?: string
  onChange?: (value: string) => void
}

export function useCodeMirror({ initialValue = "", onChange }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          drawSelection(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage }),
          markdownDecorations(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange?.(update.state.doc.toString())
            }
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "15px" },
            ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
            ".cm-content": { padding: "16px" },
            ".cm-focused": { outline: "none" }
          })
        ]
      }),
      parent: containerRef.current
    })

    viewRef.current = view
    return () => view.destroy()
  }, [])

  const getValue = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? ""
  }, [])

  return { containerRef, getValue, viewRef }
}
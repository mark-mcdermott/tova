import { useEffect, useRef, useCallback } from "react"
import { EditorView, keymap, drawSelection, dropCursor } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import {
  markdown,
  markdownLanguage,
  markdownKeymap,
  pasteURLAsLink
} from "@codemirror/lang-markdown"
import { indentUnit } from "@codemirror/language"
import { markdownDecorations } from "./markdownDecorations"
import { imageDrop } from "./imageDrop"
import { blogDecorations } from "./blogDecorations"
import { blogSelector, SelectorAnchor } from "./blogSelector"
import { formatKeymap } from "./formats"

interface UseCodeMirrorOptions {
  initialValue?: string
  onChange?: (value: string) => void
  /** Vault path of the note being edited, so dropped images know where to land. */
  noteId?: string | null
  /** Turns an image URL in the document into a source the renderer may load. */
  resolveImage?: (url: string) => string | null
  onError?: (message: string | null) => void
  /** Called when the rocket at the end of an `@blog post` line is clicked. */
  onPublish?: (blog: string, headerLine: number) => void
  /** Called as `@` is typed on an empty line, and with null when it stops applying. */
  onSelectBlog?: (anchor: SelectorAnchor | null) => void
  /** Spaces an indent inserts. */
  tabSize?: number
}

export function useCodeMirror({
  initialValue = "",
  onChange,
  noteId = null,
  resolveImage,
  onError,
  onPublish,
  onSelectBlog,
  tabSize = 2
}: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // The view is built once, so a preference that changes an extension has to
  // be swapped in rather than passed at construction.
  const indent = useRef(new Compartment())

  // The view is built once, so every handler must reach the latest props
  // through a ref rather than capturing the ones present at mount.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const noteIdRef = useRef(noteId)
  noteIdRef.current = noteId

  const resolveImageRef = useRef(resolveImage)
  resolveImageRef.current = resolveImage

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const onPublishRef = useRef(onPublish)
  onPublishRef.current = onPublish

  const onSelectBlogRef = useRef(onSelectBlog)
  onSelectBlogRef.current = onSelectBlog

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
          // CodeMirror disables this by default. Chromium's own checker is
          // what draws the squiggles, and it only marks a word once it is
          // finished — which is the timing the build plan asks for.
          EditorView.contentAttributes.of({ spellcheck: "true" }),
          indent.current.of(indentUnit.of(" ".repeat(tabSize))),
          markdown({ base: markdownLanguage }),
          markdownDecorations({
            resolveImage: (url) => resolveImageRef.current?.(url) ?? null
          }),
          blogDecorations((blog, headerLine) => onPublishRef.current?.(blog, headerLine)),
          blogSelector((anchor) => onSelectBlogRef.current?.(anchor)),
          imageDrop(
            () => noteIdRef.current,
            (message) => onErrorRef.current?.(message)
          ),
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

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: indent.current.reconfigure(indentUnit.of(" ".repeat(tabSize)))
    })
  }, [tabSize])

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

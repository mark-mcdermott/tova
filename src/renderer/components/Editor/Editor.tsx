import { useCallback, useEffect, useRef, useState } from "react"
import { useCodeMirror } from "./useCodeMirror"
import { Toolbar, SaveStatus } from "./Toolbar"
import { countWords } from "../../utils/wordCount"
import { useNotesStore } from "../../stores/notesStore"
import { registerPendingSave } from "../../stores/pendingSave"
import { current as currentEntry } from "../../stores/history"
import { EditorHeader } from "./EditorHeader"
import { NoteSearch } from "./NoteSearch"
import { Note } from "../../../shared/types"
import { assetUrl, resolveAssetPath } from "../../../shared/assets"
import { normalizeTag, removeTagEdits } from "../../../shared/tags"
import { useBlogsStore } from "../../stores/blogsStore"
import { SelectorAnchor, insertPostBlock } from "./blogSelector"
import { Menu } from "../Popup/Menu"
import { PublishToasts } from "./PublishToast"
import { SpellingMenu } from "./SpellingMenu"
import { checkGrammar } from "../../grammarLinter"
import { setGrammarNotes } from "./grammar"
import { showMatches } from "./searchHighlight"
import { usePublishStore } from "../../stores/publishStore"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { parsePosts, publishedFieldEdit } from "../../../shared/blogPost"
import { flushPendingSave } from "../../stores/pendingSave"

const SAVE_DEBOUNCE_MS = 500

interface EditorProps {
  note: Note
}

export function Editor({ note }: EditorProps) {
  const grammarOn = usePreferencesStore((state) => state.preferences.grammar)
  const grammarRef = useRef<(text: string) => void>(() => undefined)
  const openSeq = useNotesStore((state) => state.openSeq)
  const showIndex = useNotesStore((state) => state.showIndex)
  const [finding, setFinding] = useState(false)
  const [findSeq, setFindSeq] = useState(0)

  /** Assigned after the hook, for the same reason grammarRef is. */
  const findRef = useRef<() => void>(() => undefined)
  const setTags = useNotesStore((state) => state.setTags)
  const save = useNotesStore((state) => state.save)
  const rememberScroll = useNotesStore((state) => state.rememberScroll)
  const showSettings = useNotesStore((state) => state.showSettings)
  const blogs = useBlogsStore((state) => state.blogs)
  const startPublish = usePublishStore((state) => state.start)
  const tabSize = usePreferencesStore((state) => state.preferences.tabSize)

  const [title, setTitle] = useState("")
  const [wordCount, setWordCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [dropError, setDropError] = useState<string | null>(null)
  const [blogAnchor, setBlogAnchor] = useState<SelectorAnchor | null>(null)

  // The debounced save reads through refs so it always writes the current
  // title and body, not whichever values existed when it was scheduled.
  const titleRef = useRef("")
  const tagAddRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef("")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loading = useRef(false)

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus("saving")

    saveTimer.current = setTimeout(() => {
      // Cleared so the ref answers "is a write still owed?" truthfully.
      saveTimer.current = null
      Promise.resolve(save(titleRef.current, bodyRef.current))
        .then(() => setSaveStatus("saved"))
        .catch((error: unknown) => {
          setSaveStatus("error")
          console.error("Failed to save note", error)
        })
    }, SAVE_DEBOUNCE_MS)
  }, [save])

  const handleBodyChange = useCallback(
    (value: string) => {
      bodyRef.current = value
      setWordCount(countWords(value))
      // Loading a note into the editor is not an edit worth saving back.
      if (!loading.current) scheduleSave()
    },
    [scheduleSave]
  )

  const handleTitleChange = useCallback(
    (value: string) => {
      titleRef.current = value
      setTitle(value)
      scheduleSave()
    },
    [scheduleSave]
  )

  // Only the vault is resolvable; a remote image stays raw markdown rather than
  // reaching for the network from a local-first app.
  const resolveImage = useCallback(
    (url: string): string | null => {
      const path = resolveAssetPath(note.id, url)
      return path === null ? null : assetUrl(path)
    },
    [note.id]
  )

  const { containerRef, viewRef, setDoc } = useCodeMirror({
    onChange: handleBodyChange,
    noteId: note.id,
    resolveImage,
    onOpenTag: (tag) => showIndex({ kind: "tag", tag }),
    onError: setDropError,
    onSelectBlog: setBlogAnchor,
    tabSize,
    onPublish: (blog, headerLine) => void publishPost(blog, headerLine),
    onLeaveBackwards: () => tagAddRef.current?.focus(),
    onCheckGrammar: grammarOn ? (text) => void grammarRef.current(text) : undefined,
    onFind: () => findRef.current()
  })

  /**
   * Both ways out go through here. Closing from the note rather than from the
   * bar would otherwise leave the highlights painted — the note still answering
   * a question the reader has closed.
   */
  const closeFind = useCallback(() => {
    setFinding(false)
    const view = viewRef.current
    if (view !== null) showMatches(view, [], -1)
    view?.focus()
  }, [viewRef])

  /** A toggle, so the key that opened it closes it wherever the caret is. */
  findRef.current = () => {
    if (finding) {
      closeFind()
      return
    }
    setFinding(true)
    setFindSeq((seq) => seq + 1)
  }

  /**
   * Assigned after the hook, because the view it dispatches into is what the
   * hook returns. The wrapper handed to CodeMirror stays stable, so turning
   * grammar on does not rebuild the editor.
   */
  grammarRef.current = async (text: string) => {
    try {
      const notes = await checkGrammar(text)
      viewRef.current?.dispatch({ effects: setGrammarNotes.of(notes) })
    } catch {
      // A checker that will not load is not a reason to stop writing.
    }
  }

  /**
   * The file on disk is what gets published, so a debounced save is flushed
   * first. On success the note records what it went out as, which is also what
   * turns the rocket into a tick.
   */
  const publishPost = useCallback(
    async (blog: string, headerLine: number) => {
      if (useBlogsStore.getState().blogs.length === 0) {
        showSettings()
        return
      }

      await flushPendingSave()
      const finished = await startPublish({ noteId: note.id, blog, headerLine })
      if (finished.phase !== "published") return

      const view = viewRef.current
      if (view === null) return

      const doc = view.state.doc.toString()
      const post = parsePosts(doc).find((entry) => entry.headerLine === headerLine)
      if (post === undefined) return

      view.dispatch({ changes: publishedFieldEdit(doc, post, finished.filename) })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id, showSettings, startPublish]
  )

  // Anything that moves the file underneath us — a drag, a menu move — flushes
  // this first, so a debounced write cannot land on the old path afterwards.
  useEffect(() => {
    return registerPendingSave(async () => {
      if (saveTimer.current === null) return
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      await save(titleRef.current, bodyRef.current)
      setSaveStatus("saved")
    })
  }, [save])

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)

    titleRef.current = note.title
    bodyRef.current = note.body
    setTitle(note.title)
    setWordCount(countWords(note.body))
    setSaveStatus("idle")

    // setDoc dispatches synchronously, so the listener fires and the guard
    // clears before this effect returns.
    loading.current = true
    setDoc(note.body)
    loading.current = false

    // Restore where this entry was left, after layout has settled.
    const entry = currentEntry(useNotesStore.getState().history)
    const scroller = viewRef.current?.scrollDOM
    if (entry !== null && scroller !== undefined) {
      requestAnimationFrame(() => {
        scroller.scrollTop = entry.scrollTop
      })
    }
    // Keyed on openSeq, not the note id, so a rename-on-save never reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSeq, setDoc])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Report scroll so back and forward return to where the note was left.
  // Coalesced to one update per frame; the store keeps it off the render path.
  useEffect(() => {
    const scroller = viewRef.current?.scrollDOM
    if (scroller === undefined) return

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => rememberScroll(scroller.scrollTop))
    }

    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [rememberScroll, viewRef])

  return (
    <div className="editor-shell">
      <EditorHeader
        tagAddRef={tagAddRef}
        note={note}
        title={title}
        onTitleChange={handleTitleChange}
        onTitleCommit={() => viewRef.current?.focus()}
        onAddTag={(tag) => {
          const name = normalizeTag(tag)
          if (name === null) return

          // Front matter, not the prose. A tag asked for in the row belongs to
          // the note rather than to a sentence in it, and writing it into the
          // body is what put the same tag on screen twice.
          const already = note.tags.some((seen) => seen.toLowerCase() === name.toLowerCase())
          if (already) return

          void setTags(note.id, [...note.manualTags, name])
        }}
        onRemoveTag={(tag) => {
          const manual = note.manualTags.some((seen) => seen.toLowerCase() === tag.toLowerCase())

          if (manual) {
            // Only the front matter entry. If the prose also says it, the chip
            // comes back lighter — which is the honest answer: the note is
            // still tagged, by the text rather than by the row.
            void setTags(
              note.id,
              note.manualTags.filter((seen) => seen.toLowerCase() !== tag.toLowerCase())
            )
            return
          }

          const view = viewRef.current
          if (view === null) return

          // Hoisted, so it lives in the prose. Every occurrence: leaving one
          // behind puts the chip straight back.
          const edits = removeTagEdits(view.state.doc.toString(), tag)
          if (edits.length > 0) view.dispatch({ changes: edits })
        }}
        onOpenTag={(tag) => showIndex({ kind: "tag", tag })}
        find={
          finding ? <NoteSearch viewRef={viewRef} openSeq={findSeq} onClose={closeFind} /> : null
        }
      />

      <div className="editor-body" ref={containerRef} />

      {dropError !== null && (
        <p className="editor-drop-error" role="alert">
          {dropError}
          <button
            type="button"
            className="editor-drop-dismiss"
            aria-label="Dismiss"
            onClick={() => setDropError(null)}
          >
            ×
          </button>
        </p>
      )}

      <Toolbar viewRef={viewRef} wordCount={wordCount} saveStatus={saveStatus} />

      <PublishToasts />

      <SpellingMenu />

      {blogAnchor !== null && blogs.length > 0 && (
        <Menu
          x={blogAnchor.x}
          y={blogAnchor.y}
          items={blogs.map((blog) => ({
            label: blog.name,
            hint: "blog",
            accent: true,
            onSelect: () => {
              const view = viewRef.current
              if (view !== null) insertPostBlock(view, blogAnchor.from, blog.name, new Date())
            }
          }))}
          onClose={() => setBlogAnchor(null)}
        />
      )}
    </div>
  )
}

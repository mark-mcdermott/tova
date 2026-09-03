import { useCallback, useEffect, useRef, useState } from "react"
import { useCodeMirror } from "./useCodeMirror"
import { Toolbar, SaveStatus } from "./Toolbar"
import { countWords } from "../../utils/wordCount"
import { useNotesStore } from "../../stores/notesStore"
import { Note } from "../../../shared/types"

const SAVE_DEBOUNCE_MS = 500

interface EditorProps {
  note: Note
}

export function Editor({ note }: EditorProps) {
  const openSeq = useNotesStore((state) => state.openSeq)
  const save = useNotesStore((state) => state.save)

  const [title, setTitle] = useState("")
  const [wordCount, setWordCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  // The debounced save reads through refs so it always writes the current
  // title and body, not whichever values existed when it was scheduled.
  const titleRef = useRef("")
  const bodyRef = useRef("")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loading = useRef(false)

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus("saving")

    saveTimer.current = setTimeout(() => {
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

  const { containerRef, viewRef, setDoc } = useCodeMirror({ onChange: handleBodyChange })

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
    // Keyed on openSeq, not the note id, so a rename-on-save never reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSeq, setDoc])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault()
      viewRef.current?.focus()
    }
  }

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <input
          className="title-input"
          placeholder="Untitled"
          aria-label="Note title"
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
      </div>

      <div className="editor-body" ref={containerRef} />

      <Toolbar viewRef={viewRef} wordCount={wordCount} saveStatus={saveStatus} />
    </div>
  )
}

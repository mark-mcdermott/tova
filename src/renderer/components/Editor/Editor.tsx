import { useCallback, useEffect, useRef, useState } from "react"
import { useCodeMirror } from "./useCodeMirror"
import { Toolbar, SaveStatus } from "./Toolbar"
import { countWords } from "../../utils/wordCount"

const SAVE_DEBOUNCE_MS = 500

export function Editor() {
  const [title, setTitle] = useState("")
  const [wordCount, setWordCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  // The debounced save reads through refs so it always writes the current
  // title and body, not whichever values existed when it was scheduled.
  const titleRef = useRef("")
  const bodyRef = useRef("")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus("saving")

    saveTimer.current = setTimeout(() => {
      const heading = titleRef.current.trim()
      const content = heading ? `# ${heading}\n\n${bodyRef.current}` : bodyRef.current

      const failed = (error: unknown) => {
        setSaveStatus("error")
        console.error("Failed to save note", error)
      }

      // A missing preload bridge throws synchronously rather than rejecting,
      // which would otherwise leave the status pinned on "Saving…" forever.
      try {
        window.electron
          .writeTemp(content)
          .then(() => setSaveStatus("saved"))
          .catch(failed)
      } catch (error) {
        failed(error)
      }
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const handleBodyChange = useCallback(
    (value: string) => {
      bodyRef.current = value
      setWordCount(countWords(value))
      scheduleSave()
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

  const { containerRef, viewRef } = useCodeMirror({
    initialValue: "",
    onChange: handleBodyChange
  })

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

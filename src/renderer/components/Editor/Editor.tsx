import { useRef, useState, useCallback } from "react"
import { useCodeMirror } from "./useCodeMirror"
import { Toolbar } from "./Toolbar"
import { countWords } from "../../utils/wordCount"

export function Editor() {
  const [title, setTitle] = useState("")
  const [wordCount, setWordCount] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((value: string) => {
    setWordCount(countWords(value))

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const content = `# ${title}\n\n${value}`
      await window.electron.writeTemp(content)
    }, 500)
  }, [title])

  const { containerRef, viewRef } = useCodeMirror({
    initialValue: "",
    onChange: handleChange
  })

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault()
      viewRef.current?.focus()
    }
  }

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <input
          ref={titleRef}
          className="title-input"
          placeholder="Untitled"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
      </div>
      <div className="editor-body" ref={containerRef} />
      <Toolbar viewRef={viewRef} wordCount={wordCount} />
    </div>
  )
}
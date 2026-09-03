import { EditorView } from "@codemirror/view"
import { applyFormat, toolbarItems } from "./formats"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

interface ToolbarProps {
  viewRef: React.RefObject<EditorView | null>
  wordCount: number
  saveStatus: SaveStatus
}

const statusLabels: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed"
}

export function Toolbar({ viewRef, wordCount, saveStatus }: ToolbarProps) {
  return (
    <div className="toolbar">
      <span className="toolbar-status">
        {wordCount} {wordCount === 1 ? "word" : "words"}
      </span>
      <span className={`toolbar-status toolbar-status-${saveStatus}`} role="status">
        {statusLabels[saveStatus]}
      </span>

      <div className="toolbar-actions">
        {toolbarItems.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.title}
            aria-label={item.title}
            // mousedown-with-preventDefault keeps focus in the editor, so the
            // selection the format applies to survives the click.
            onMouseDown={(event) => {
              event.preventDefault()
              const view = viewRef.current
              if (view) applyFormat(view, item.format)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

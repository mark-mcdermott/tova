import { EditorView } from "@codemirror/view"
import { applyFormat, toolbarButtons } from "./formats"
import { useTooltip } from "../../useTooltip"
import { Icon } from "../Sidebar/icons"

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
  const tip = useTooltip()
  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        {toolbarButtons.map((item) => (
          <button
            key={item.key}
            type="button"
            {...tip(item.title)}
            aria-label={item.title}
            data-glyph={item.key}
            // mousedown-with-preventDefault keeps focus in the editor, so the
            // selection the format applies to survives the click.
            onMouseDown={(event) => {
              event.preventDefault()
              const view = viewRef.current
              if (view) applyFormat(view, item.format)
            }}
          >
            {/* The glyph is nudged on its own for some symbols, so it needs a
                box of its own to move inside the button's. */}
            <span className="toolbar-glyph">
              {"icon" in item ? <Icon name={item.icon} className="toolbar-icon" /> : item.label}
            </span>
          </button>
        ))}
      </div>

      <span className={`toolbar-status toolbar-status-${saveStatus}`} role="status">
        {statusLabels[saveStatus]}
      </span>
      <span className="toolbar-status">
        {wordCount} {wordCount === 1 ? "word" : "words"}
      </span>
    </div>
  )
}

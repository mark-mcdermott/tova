import { EditorView } from "@codemirror/view"

interface ToolbarProps {
  viewRef: React.RefObject<EditorView | null>
  wordCount: number
}

type WrapFormat = { before: string; after: string }
type LineFormat = { prefix: string }
type Format = WrapFormat | LineFormat

function isWrap(f: Format): f is WrapFormat {
  return "before" in f
}

const formats: Record<string, Format> = {
  bold:       { before: "**", after: "**" },
  italic:     { before: "*", after: "*" },
  strike:     { before: "~~", after: "~~" },
  inlineCode: { before: "`", after: "`" },
  h1:         { prefix: "# " },
  h2:         { prefix: "## " },
  plain:      { prefix: "" },
}

function applyFormat(view: EditorView, format: Format) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.doc.sliceString(from, to)

  let transaction
  if (isWrap(format)) {
    transaction = state.update({
      changes: { from, to, insert: `${format.before}${selectedText}${format.after}` },
      selection: { anchor: from + format.before.length, head: to + format.before.length },
    })
  } else {
    const line = state.doc.lineAt(from)
    const newText = format.prefix + line.text.replace(/^#+\s?/, "")
    transaction = state.update({
      changes: { from: line.from, to: line.to, insert: newText }
    })
  }

  view.dispatch(transaction)
  view.focus()
}

export function Toolbar({ viewRef, wordCount }: ToolbarProps) {
  const btn = (label: string, formatKey: string, title: string) => (
    <button
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        if (viewRef.current) applyFormat(viewRef.current, formats[formatKey])
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="toolbar">
      <span className="word-count">{wordCount} words</span>
      {btn("T", "plain", "Plain (Cmd+Shift+0")}
      {btn("H1", "h1", "Heading 1 (Cmd+Shift+1")}
      {btn("H2", "h2", "Heading 2 (Cmd+Shift+2")}
      {btn("B", "bold", "Bold (Cmd+B")}
      {btn("I", "italic", "Italic (Cmd+I")}
      {btn("/", "strike", "Strikethrough (Cmd+Shift+X")}
      {btn("<>", "inlineCode", "Inline Code (Cmd+E")}
    </div>
  )
}
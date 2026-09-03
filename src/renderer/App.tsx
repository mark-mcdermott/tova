import { useEffect } from "react"
import { Sidebar } from "./components/Sidebar/Sidebar"
import { Editor } from "./components/Editor/Editor"
import { useNotesStore } from "./stores/notesStore"
import "./styles/editor.css"
import "./styles/sidebar.css"

export default function App() {
  const load = useNotesStore((state) => state.load)
  const active = useNotesStore((state) => state.active)

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="app">
      <Sidebar />
      <main className="workspace">
        {active === null ? (
          <div className="editor-shell editor-shell-empty">
            <p className="editor-placeholder">Select a note, or create one to start writing.</p>
          </div>
        ) : (
          <Editor note={active} />
        )}
      </main>
    </div>
  )
}

import { useEffect } from "react"
import { Sidebar } from "./components/Sidebar/Sidebar"
import { Editor } from "./components/Editor/Editor"
import { VaultWarning } from "./components/VaultWarning"
import { useNotesStore } from "./stores/notesStore"
import "./styles/editor.css"
import "./styles/sidebar.css"

export default function App() {
  const load = useNotesStore((state) => state.load)
  const checkVault = useNotesStore((state) => state.checkVault)
  const active = useNotesStore((state) => state.active)
  const vaultStatus = useNotesStore((state) => state.vaultStatus)

  useEffect(() => {
    load()
    checkVault()
  }, [load, checkVault])

  // The date can roll over while the app is open; refresh the list so the new
  // daily note appears without reopening anything the user was editing.
  useEffect(() => {
    return window.tova.events.onNotesChanged(() => {
      load()
    })
  }, [load])

  const needsRecovery =
    vaultStatus !== null && vaultStatus.empty && vaultStatus.backups.length > 0

  return (
    <div className="app">
      <Sidebar />
      <main className="workspace">
        {needsRecovery && vaultStatus !== null ? (
          <div className="editor-shell editor-shell-empty">
            <VaultWarning status={vaultStatus} />
          </div>
        ) : active === null ? (
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

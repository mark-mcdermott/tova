import { useEffect } from "react"
import { Sidebar } from "./components/Sidebar/Sidebar"
import { Editor } from "./components/Editor/Editor"
import { Settings } from "./components/Settings/Settings"
import { VaultWarning } from "./components/VaultWarning"
import { ChevronIcon } from "./components/Sidebar/icons"
import { useNotesStore } from "./stores/notesStore"
import { useBlogsStore } from "./stores/blogsStore"
import { usePreferencesStore } from "./stores/preferencesStore"
import { applyBackground, resolveBackground } from "./backgrounds"
import "./styles/editor.css"
import "./styles/sidebar.css"
import "./styles/settings.css"

export default function App() {
  const load = useNotesStore((state) => state.load)
  const checkVault = useNotesStore((state) => state.checkVault)
  const active = useNotesStore((state) => state.active)
  const vaultStatus = useNotesStore((state) => state.vaultStatus)
  const view = useNotesStore((state) => state.view)
  const sidebarCollapsed = useNotesStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useNotesStore((state) => state.toggleSidebar)
  const loadBlogs = useBlogsStore((state) => state.load)
  const loadPreferences = usePreferencesStore((state) => state.load)
  const fontSize = usePreferencesStore((state) => state.preferences.fontSize)
  const background = usePreferencesStore((state) => state.preferences.background)
  const preferencesLoaded = usePreferencesStore((state) => state.loaded)

  useEffect(() => {
    load()
    checkVault()
    // The sidebar lists blogs, so they are loaded once for the app rather than
    // by whichever component happens to need them first.
    void loadBlogs()
    void loadPreferences()
  }, [load, checkVault, loadBlogs, loadPreferences])

  // The date can roll over while the app is open; refresh the list so the new
  // daily note appears without reopening anything the user was editing.
  useEffect(() => {
    return window.tova.events.onNotesChanged(() => {
      load()
    })
  }, [load])

  // One preference reaches the whole app through a variable rather than being
  // threaded into the editor, the toolbar and the prose separately.
  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`)
  }, [fontSize])

  // Applied only once preferences have loaded, so a chosen background is not
  // overwritten by a shuffle a frame earlier.
  useEffect(() => {
    if (preferencesLoaded) applyBackground(resolveBackground(background))
  }, [preferencesLoaded, background])

  // Chromium navigates the window to any file dropped outside a handler, which
  // would replace the app with the image. Nothing else drops onto the window.
  useEffect(() => {
    const swallow = (event: DragEvent) => event.preventDefault()
    window.addEventListener("dragover", swallow)
    window.addEventListener("drop", swallow)
    return () => {
      window.removeEventListener("dragover", swallow)
      window.removeEventListener("drop", swallow)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggleSidebar])

  const needsRecovery = vaultStatus !== null && vaultStatus.empty && vaultStatus.backups.length > 0

  return (
    <div className={`app${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <div className="shell">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-reveal"
            title="Show sidebar (Cmd+\\)"
            aria-label="Show sidebar"
            onClick={toggleSidebar}
          >
            <ChevronIcon direction="right" />
          </button>
        ) : (
          <Sidebar />
        )}

        <main className="workspace">
          {needsRecovery && vaultStatus !== null ? (
            <div className="editor-shell editor-shell-empty">
              <VaultWarning status={vaultStatus} />
            </div>
          ) : view === "settings" ? (
            <Settings />
          ) : active === null ? (
            <div className="editor-shell editor-shell-empty">
              <p className="editor-placeholder">Select a note, or create one to start writing.</p>
            </div>
          ) : (
            <Editor note={active} />
          )}
        </main>
      </div>
    </div>
  )
}

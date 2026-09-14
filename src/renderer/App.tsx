import { useEffect, useState } from "react"
import { Sidebar } from "./components/Sidebar/Sidebar"
import { Editor } from "./components/Editor/Editor"
import { Settings } from "./components/Settings/Settings"
import { IndexPage } from "./components/Index/IndexPage"
import { VaultWarning } from "./components/VaultWarning"
import { Welcome, type WelcomeChoice } from "./components/Welcome"
import { ChevronIcon } from "./components/Sidebar/icons"
import { useNotesStore } from "./stores/notesStore"
import { current as currentEntry } from "./stores/history"
import { useBlogsStore } from "./stores/blogsStore"
import { usePreferencesStore } from "./stores/preferencesStore"
import { applyTitleFont } from "./titleFont"
import { applyBackground, resolveBackground } from "./backgrounds"
import { Home } from "./components/Home/Home"
import { Tooltip } from "./components/Popup/Tooltip"
import { useTooltip } from "./useTooltip"
import { systemTheme, watchSystemTheme } from "./theme"
import { Theme } from "../shared/preferences"
import "./styles/editor.css"
import "./styles/sidebar.css"
import "./styles/settings.css"
import "./styles/home.css"
import "./styles/welcome.css"

export default function App() {
  const load = useNotesStore((state) => state.load)
  const checkVault = useNotesStore((state) => state.checkVault)
  const active = useNotesStore((state) => state.active)
  const vaultStatus = useNotesStore((state) => state.vaultStatus)
  const view = useNotesStore((state) => state.view)
  const sidebarCollapsed = useNotesStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useNotesStore((state) => state.toggleSidebar)
  const tip = useTooltip()
  const loadBlogs = useBlogsStore((state) => state.load)
  const loadPreferences = usePreferencesStore((state) => state.load)
  const fontSize = usePreferencesStore((state) => state.preferences.fontSize)
  const backgroundLight = usePreferencesStore((state) => state.preferences.backgroundLight)
  const backgroundDark = usePreferencesStore((state) => state.preferences.backgroundDark)
  const themeChoice = usePreferencesStore((state) => state.preferences.theme)
  const [systemIs, setSystemIs] = useState<Theme>(() => systemTheme())
  const theme: Theme = themeChoice === "system" ? systemIs : themeChoice
  const titleFont = usePreferencesStore((state) => state.preferences.titleFont)
  const proseWidth = usePreferencesStore((state) => state.preferences.proseWidth)
  const preferencesLoaded = usePreferencesStore((state) => state.loaded)
  const userBackgrounds = usePreferencesStore((state) => state.userBackgrounds)
  const greeted = usePreferencesStore((state) => state.preferences.greeted)
  const updatePreferences = usePreferencesStore((state) => state.update)

  /*
   * Written on every move rather than on quit. The window remembers its frame
   * on close, which is fine for a frame — losing your place to a crash is not,
   * and a crash is exactly when nothing gets to happen on the way out.
   */
  const here = useNotesStore((state) => currentEntry(state.history)?.screen ?? null)
  useEffect(() => {
    if (here !== null) void window.tova.session.write(here)
  }, [here])

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

  // A bundled face is served by CSS through the attribute; an added one is a
  // file, so it has to be registered before the attribute means anything. Both
  // paths end in the attribute, so the stack itself stays in CSS.
  useEffect(() => {
    void applyTitleFont(titleFont)
  }, [titleFont])

  useEffect(() => {
    document.documentElement.dataset.proseWidth = proseWidth
  }, [proseWidth])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Only while following the OS: an explicit choice should not move under the
  // reader because the sun went down.
  useEffect(() => {
    if (themeChoice !== "system") return
    return watchSystemTheme(setSystemIs)
  }, [themeChoice])

  // Applied only once preferences have loaded, so a chosen background is not
  // overwritten by a shuffle a frame earlier.
  useEffect(() => {
    if (!preferencesLoaded) return
    const chosen = theme === "dark" ? backgroundDark : backgroundLight
    applyBackground(resolveBackground(chosen, theme, userBackgrounds[theme]))
  }, [preferencesLoaded, backgroundLight, backgroundDark, theme, userBackgrounds])

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

  /*
   * Only once the preferences are actually here. They default to ungreeted, so
   * rendering this on the default would flash the first-run question at
   * somebody who answered it months ago, every time they opened the app.
   */
  const asking = preferencesLoaded && !greeted

  async function answer(choice: WelcomeChoice) {
    await updatePreferences({ ...choice, greeted: true })

    // Not awaited: 15MB is a long time to hold somebody on a dialog they have
    // already finished with. It lands when it lands, and grammar starts
    // working when it does.
    if (choice.grammar) void window.tova.grammar.fetch().catch(() => {})
  }

  return (
    <div className={`app${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      {/* One of these for the whole app: a tooltip is drawn against the
          viewport, so it has nothing to do with where its control sits. */}
      <Tooltip />
      {asking && <Welcome onChoose={(choice) => void answer(choice)} />}
      <div className="shell">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-reveal"
            {...tip("Show sidebar (Cmd+\\)")}
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
          ) : view === "home" ? (
            <Home />
          ) : view === "index" ? (
            <IndexPage />
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

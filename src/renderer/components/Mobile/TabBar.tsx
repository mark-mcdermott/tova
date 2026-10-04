import { useNotesStore } from "../../stores/notesStore"
import { Icon, IconName } from "../Sidebar/icons"

interface Tab {
  label: string
  icon: IconName
  here: boolean
  go: () => void
}

/**
 * The three places a phone goes, along the bottom where a thumb already is.
 *
 * Not on the editor. The mocks replace this row with the formatting controls
 * and the keyboard, and two bars at the foot of a 24rem screen is most of the
 * writing gone — so `App` renders it everywhere else, and the way back out of
 * a note is the nav row at the top of it.
 *
 * The sidebar is still how you reach the rest of the vault: these are the
 * three worth a tap, not the whole of it.
 */
export function TabBar() {
  const view = useNotesStore((state) => state.view)
  const indexTarget = useNotesStore((state) => state.indexTarget)
  const section = useNotesStore((state) => state.active?.section ?? null)
  const showIndex = useNotesStore((state) => state.showIndex)
  const showSettings = useNotesStore((state) => state.showSettings)
  const openToday = useNotesStore((state) => state.openToday)

  const tabs: Tab[] = [
    {
      label: "Notes",
      icon: "notes",
      here: view === "index" && indexTarget?.kind === "recent",
      go: () => showIndex({ kind: "recent" })
    },
    {
      label: "Daily",
      icon: "daily",
      here: view === "editor" && section === "daily",
      go: () => void openToday()
    },
    {
      label: "Settings",
      icon: "cog",
      here: view === "settings",
      go: () => showSettings()
    }
  ]

  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          className={`tabbar-tab${tab.here ? " is-here" : ""}`}
          aria-current={tab.here ? "page" : undefined}
          onClick={tab.go}
        >
          <Icon name={tab.icon} className="tabbar-icon" />
          <span className="tabbar-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

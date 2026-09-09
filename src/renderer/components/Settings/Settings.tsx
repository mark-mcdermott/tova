import { SETTINGS_TABS, SettingsTab, useNotesStore } from "../../stores/notesStore"
import { Icon } from "../Sidebar/icons"
import { BlogSection } from "./BlogSection"
import { AppearanceTab } from "./tabs/AppearanceTab"
import { DocsTab } from "./tabs/DocsTab"
import { GeneralTab } from "./tabs/GeneralTab"
import { ProfileTab } from "./tabs/ProfileTab"
import { VaultTab } from "./tabs/VaultTab"
import { useTooltip } from "../../useTooltip"

const LABELS: Record<SettingsTab, string> = {
  profile: "Profile",
  appearance: "Appearance",
  vault: "Vault",
  blogs: "Blogs",
  general: "General",
  docs: "Docs"
}

function panelFor(tab: SettingsTab) {
  if (tab === "profile") return <ProfileTab />
  if (tab === "appearance") return <AppearanceTab />
  if (tab === "vault") return <VaultTab />
  if (tab === "blogs") return <BlogSection />
  if (tab === "general") return <GeneralTab />
  return <DocsTab />
}

/**
 * Settings takes over the workspace column, the way the spec describes it: the
 * sidebar stays put and the back arrow returns to the note that was open.
 */
export function Settings() {
  const tip = useTooltip()
  const activeId = useNotesStore((state) => state.activeId)
  const open = useNotesStore((state) => state.open)
  const openToday = useNotesStore((state) => state.openToday)
  const tab = useNotesStore((state) => state.settingsTab)
  const showSettings = useNotesStore((state) => state.showSettings)

  // Leaves settings the way the user arrived: back to whatever was open, or to
  // today's note if nothing was.
  function close() {
    if (activeId === null) void openToday()
    else void open(activeId)
  }

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <nav className="editor-nav" aria-label="Settings navigation">
          <button
            type="button"
            className="icon-button"
            {...tip("Back to writing")}
            aria-label="Back to writing"
            onClick={close}
          >
            <Icon name="back" className="nav-icon" />
          </button>

          <ol className="breadcrumb">
            <li>
              <span className="breadcrumb-current">Settings</span>
            </li>
          </ol>
        </nav>

        <h1 className="settings-heading">{LABELS[tab]}</h1>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={`settings-tab${tab === name ? " is-current" : ""}`}
            onClick={() => showSettings(name)}
          >
            {LABELS[name]}
          </button>
        ))}
      </div>

      <div className="settings-body" role="tabpanel">
        {panelFor(tab)}
      </div>
    </div>
  )
}

import { THEMES, nextTheme, themeIcon } from "../../../shared/preferences"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { useTooltip } from "../../useTooltip"
import { Icon } from "../Sidebar/icons"

/** The settings list's own word for a choice, so the two never drift. */
function themeLabel(theme: string): string {
  return THEMES.find((option) => option.value === theme)?.label ?? theme
}

/**
 * Light, dark and system, in one control.
 *
 * The icon is the mode you are on. With that fixed, the only thing left for the
 * button to mean is "step to the next one" — the ambiguity in a two-state
 * toggle is that its icon could equally be the state or the target.
 *
 * Shared by the editor and the index pages, so the same control sits in the
 * same corner wherever you are.
 */
export function AppearanceButton() {
  const theme = usePreferencesStore((state) => state.preferences.theme)
  const update = usePreferencesStore((state) => state.update)
  const tip = useTooltip()

  return (
    <button
      type="button"
      className="icon-button"
      {...tip(`Appearance: ${themeLabel(theme)} — click for ${themeLabel(nextTheme(theme))}`)}
      aria-label={`Appearance: ${themeLabel(theme)}. Change to ${themeLabel(nextTheme(theme))}`}
      onClick={() => void update({ theme: nextTheme(theme) })}
    >
      <Icon name={themeIcon(theme)} className="nav-icon" />
    </button>
  )
}

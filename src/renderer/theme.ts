import { Theme, ThemeChoice } from "../shared/preferences"

const DARK = "(prefers-color-scheme: dark)"

/** What "system" currently means. */
export function systemTheme(): Theme {
  return window.matchMedia(DARK).matches ? "dark" : "light"
}

export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === "system" ? systemTheme() : choice
}

/**
 * Calls back when the OS switches, so a reader on "system" does not have to
 * restart to follow it. Returns the unsubscribe.
 */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  const query = window.matchMedia(DARK)
  const listener = (event: MediaQueryListEvent): void => {
    onChange(event.matches ? "dark" : "light")
  }

  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

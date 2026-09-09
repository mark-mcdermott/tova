import { usePreferencesStore } from "./stores/preferencesStore"

/**
 * Spread onto a control instead of writing `title` directly, so the whole app
 * honours the preference from one place:
 *
 *   <button {...tip("New note")} aria-label="New note">
 *
 * The label is never the tooltip's job — every control keeps its `aria-label`
 * whatever this returns, so turning tooltips off costs nothing but the hover.
 */
export function useTooltip(): (text: string) => { title?: string } {
  const on = usePreferencesStore((state) => state.preferences.tooltips)
  return (text: string) => (on ? { title: text } : {})
}

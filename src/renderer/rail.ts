/**
 * Driving the sidebar from the keyboard.
 *
 * The rail is a flat list as far as this is concerned: sections, the folders of
 * whichever section is unfolded, then tags, in the order they are drawn. Moving
 * through it is moving through what is on screen, so nesting needs no special
 * case — a folder is simply the row after the section holding it, and a
 * collapsed section's folders are not there to step on.
 *
 * Real focus rather than a remembered index. The rows are buttons, so focus
 * gives the ring, the screen reader announcement and Return-to-activate for
 * nothing — and there is no second idea of "where the keyboard is" to keep in
 * step with the first.
 */
const ROW = "[data-rail-row]"

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`.sidebar ${ROW}`)]
}

export function railHasFocus(): boolean {
  const active = document.activeElement
  return active instanceof HTMLElement && active.closest(".sidebar") !== null
}

/**
 * Puts the keyboard in the rail, on the row marking where the reader already
 * is — so arriving by keyboard starts from the same place arriving by eye does.
 */
export function focusRail(): boolean {
  const all = rows()
  if (all.length === 0) return false

  const here = all.find((row) => row.classList.contains("is-active"))
  ;(here ?? all[0]).focus()
  return true
}

/** Moves the keyboard one row up or down, stopping at either end. */
export function moveRailFocus(step: 1 | -1): void {
  const all = rows()
  const at = all.findIndex((row) => row === document.activeElement)
  if (at === -1) {
    focusRail()
    return
  }

  // Stopping rather than wrapping: a list that loops takes a reader who is
  // holding a key from the bottom of the tags to the top of the sections
  // without them noticing they ever left.
  const next = all[Math.min(all.length - 1, Math.max(0, at + step))]
  next?.focus()
}

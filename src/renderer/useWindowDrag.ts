import { useEffect } from "react"

/**
 * Suspends the window's drag strips for as long as a popup is open.
 *
 * The window is `titleBarStyle: "hiddenInset"`, so the header and footer stand
 * in for the title bar macOS does not draw. A drag region is handled by the
 * window manager before the DOM sees it, which means a click there produces no
 * `mousedown` at all — so a menu's outside-click listener never hears it, and a
 * dialog's backdrop never gets the click either. Clicking beside an open menu
 * left it open; clicking anywhere lower closed it.
 *
 * Losing the ability to drag the window while a menu is open is the right
 * trade: dismissing the menu is what the click was for.
 */

/** Popups nest — a confirm opens from a menu — so the last one out restores drag. */
let open = 0

export function useSuspendWindowDrag(): void {
  useEffect(() => {
    open += 1
    document.body.classList.add("is-popup-open")

    return () => {
      open -= 1
      if (open === 0) document.body.classList.remove("is-popup-open")
    }
  }, [])
}

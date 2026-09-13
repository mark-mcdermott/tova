import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTooltipStore } from "../../stores/tooltipStore"

const EDGE_GAP = 8
/** Between the control and the tooltip, so the pointer does not sit on it. */
const OFFSET = 8

/**
 * The app's own tooltip, rather than the browser's `title`.
 *
 * `title` is drawn by the operating system: it ignores the theme, cannot be
 * styled, waits about a second with no say in it, and never appears for
 * somebody using the keyboard. It was the one piece of chrome in the app that
 * looked like it belonged to a different one.
 *
 * Rendered into `document.body` rather than beside the control it describes.
 * The glass panels carry `backdrop-filter`, which makes them the containing
 * block for `position: fixed` descendants — a tooltip inside one is placed
 * against the panel instead of the viewport, and clipped by the panel's own
 * `overflow: hidden`. `Menu` learned this first.
 *
 * `aria-hidden`, and never the accessible name: every control keeps its own
 * `aria-label`, so this says nothing a screen reader has not already been
 * told, and announcing it twice would be worse than not at all.
 */
export function Tooltip() {
  const showing = useTooltipStore((state) => state.showing)
  const hide = useTooltipStore((state) => state.hide)
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  // Measured after paint, so one near an edge comes back into view rather than
  // hanging off it. Placed below by default and flipped above where there is
  // no room, which is the one direction a tooltip can always find space in.
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null || showing === null) {
      setAt(null)
      return
    }

    const { width, height } = element.getBoundingClientRect()
    const { around } = showing
    const below = around.bottom + OFFSET
    const flip = below + height + EDGE_GAP > window.innerHeight

    setAt({
      left: Math.max(
        EDGE_GAP,
        Math.min(around.left + around.width / 2 - width / 2, window.innerWidth - width - EDGE_GAP)
      ),
      top: flip ? Math.max(EDGE_GAP, around.top - height - OFFSET) : below
    })
  }, [showing])

  /*
   * Anything that moves the page takes the tooltip with it — it is placed
   * against a box measured once, and a scrolled page leaves it pointing at
   * nothing. Escape and a click dismiss it for the same reason a menu's do.
   */
  useEffect(() => {
    if (showing === null) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") hide()
    }
    window.addEventListener("scroll", hide, true)
    window.addEventListener("resize", hide)
    window.addEventListener("pointerdown", hide, true)
    document.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("scroll", hide, true)
      window.removeEventListener("resize", hide)
      window.removeEventListener("pointerdown", hide, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [showing, hide])

  if (showing === null) return null

  return createPortal(
    <div
      ref={ref}
      className="tooltip"
      role="presentation"
      aria-hidden="true"
      // Hidden until placed, so it is never seen at the wrong end of the page.
      style={at === null ? { opacity: 0 } : { left: `${at.left}px`, top: `${at.top}px` }}
    >
      {showing.text}
    </div>,
    document.body
  )
}

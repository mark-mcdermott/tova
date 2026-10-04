/**
 * How much of the page the on-screen keyboard is standing in front of.
 *
 * iOS does not shorten the page when the keyboard opens. The layout viewport
 * keeps its height and the keys are simply drawn over the bottom of it, so a
 * cursor on the last line sits behind them with nothing in the layout saying
 * so. `visualViewport` is the part that knows: its height is what you can
 * actually see, and its offset moves when the page is scrolled to follow a
 * field that was about to be covered.
 *
 * Published as a CSS variable rather than React state. What needs it is a
 * padding, and re-rendering the editor on every frame of a keyboard animation
 * would be a great deal of work to arrive at the same pixels.
 */

const PROPERTY = "--keyboard-inset"

interface Seen {
  height: number
  offsetTop: number
}

/**
 * The covered strip, in pixels, given what can be seen and how tall the page
 * believes it is.
 *
 * Never negative: a rubber-band scroll past the top of the document and the
 * sub-pixel rounding between the two viewports both read as a page taller
 * than itself, and a negative padding is not a thing anyway.
 */
export function insetFrom(view: Seen, layoutHeight: number): number {
  // A negative offset is the page being pulled past its own top, which is a
  // rubber band and never a keyboard. Counting it would report a covered
  // strip the width of the overscroll on a screen with no keys on it.
  const covered = layoutHeight - (view.height + Math.max(0, view.offsetTop))

  // A pixel of disagreement between the two viewports is noise, not a
  // keyboard, and letting it through means writing a new value every scroll.
  return covered > 1 ? covered : 0
}

/**
 * Keeps `--keyboard-inset` on the document in step with the keyboard. Returns
 * the unsubscribe, which also takes the variable back off.
 */
export function watchKeyboard(): () => void {
  const view = window.visualViewport
  if (!view) return () => {}

  const apply = (): void => {
    const inset = insetFrom(view, window.innerHeight)
    document.documentElement.style.setProperty(PROPERTY, `${inset}px`)
  }

  apply()
  view.addEventListener("resize", apply)
  view.addEventListener("scroll", apply)

  return () => {
    view.removeEventListener("resize", apply)
    view.removeEventListener("scroll", apply)
    document.documentElement.style.removeProperty(PROPERTY)
  }
}

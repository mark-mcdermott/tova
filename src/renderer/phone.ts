/**
 * The width below which Tova is one pane rather than two.
 *
 * The sidebar alone is 17.25rem, so on a 390px screen what is left over is
 * narrower than a line of prose wants to be. Below this the sidebar stops
 * taking space and becomes something you open over the writing instead.
 *
 * `styles/phone.css` carries the same number. They are two languages that
 * cannot read each other, so `phone.test.ts` reads the stylesheet and fails
 * when they drift — a layout that switched at one width while the app thought
 * it switched at another would be a sidebar taking space it was not given.
 */
export const PHONE_MAX = 767

const PHONE = `(max-width: ${PHONE_MAX}px)`

/** Whether this viewport gets the one-pane layout. */
export function isPhone(): boolean {
  return window.matchMedia(PHONE).matches
}

/**
 * Calls back when the viewport crosses the breakpoint — a rotation, a browser
 * window dragged narrower, a tablet splitting its screen. Returns the
 * unsubscribe.
 */
export function watchPhone(onChange: (phone: boolean) => void): () => void {
  const query = window.matchMedia(PHONE)
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches)

  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

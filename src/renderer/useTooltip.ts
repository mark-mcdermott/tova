import type { FocusEvent, PointerEvent } from "react"
import { usePreferencesStore } from "./stores/preferencesStore"
import { useTooltipStore } from "./stores/tooltipStore"

/*
 * How long a pointer rests before a tooltip appears.
 *
 * Not none: sweeping a pointer across a toolbar would flash one under every
 * button on the way past, which is noise rather than help. Not the second the
 * browser takes either — that is long enough to have given up asking.
 *
 * Once one is up the next is immediate. Waiting again to read the button next
 * to the one just read is the part of the browser's behaviour nobody wanted.
 */
const REST_MS = 450

let waiting: ReturnType<typeof setTimeout> | null = null

function cancel(): void {
  if (waiting !== null) clearTimeout(waiting)
  waiting = null
}

export interface TooltipProps {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: () => void
  onFocus?: (event: FocusEvent<HTMLElement>) => void
  onBlur?: () => void
}

/**
 * Spread onto a control instead of writing `title` directly, so the whole app
 * honours the preference from one place:
 *
 *   <button {...tip("New note")} aria-label="New note">
 *
 * The label is never the tooltip's job — every control keeps its `aria-label`
 * whatever this returns, so turning tooltips off costs nothing but the hover.
 *
 * It used to return `{ title }` and let the browser draw it. See `Tooltip`
 * for why it does not any more.
 */
export function useTooltip(): (text: string) => TooltipProps {
  const on = usePreferencesStore((state) => state.preferences.tooltips)
  const show = useTooltipStore((state) => state.show)
  const hide = useTooltipStore((state) => state.hide)

  return (text: string) => {
    if (!on) return {}

    const reveal = (element: HTMLElement, now: boolean): void => {
      cancel()
      const around = element.getBoundingClientRect()
      if (now) {
        show({ text, around })
        return
      }
      waiting = setTimeout(() => show({ text, around }), REST_MS)
    }

    const gone = (): void => {
      cancel()
      hide()
    }

    return {
      onPointerEnter: (event) => {
        // A tooltip already up means the reader is reading them; the next one
        // should not make them wait again.
        reveal(event.currentTarget, useTooltipStore.getState().showing !== null)
      },
      onPointerLeave: gone,
      onFocus: (event) => {
        /*
         * Only for a keyboard. `focus` fires when a control is clicked too,
         * and a tooltip appearing over the thing just pressed is in the way
         * of whatever it did. `title` never showed on focus at all, so this
         * is the half the browser was missing rather than a port of it.
         */
        if (event.currentTarget.matches(":focus-visible")) {
          reveal(event.currentTarget, true)
        }
      },
      onBlur: gone
    }
  }
}

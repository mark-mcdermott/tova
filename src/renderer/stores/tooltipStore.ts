import { create } from "zustand"

/**
 * The one tooltip on screen, if there is one.
 *
 * A store rather than props because the control that raises a tooltip and the
 * layer that draws it are nowhere near each other: a tooltip cannot be drawn
 * inside the control it describes without being clipped by whatever panel that
 * control lives in.
 */
export interface Showing {
  text: string
  /** The control's box, which is what the tooltip is placed against. */
  around: DOMRect
}

interface TooltipState {
  showing: Showing | null
  show: (showing: Showing) => void
  hide: () => void
}

export const useTooltipStore = create<TooltipState>((set) => ({
  showing: null,
  show: (showing) => set({ showing }),
  hide: () => set({ showing: null })
}))

import { useNotesStore } from "../../stores/notesStore"
import { canGoBack, canGoForward } from "../../stores/history"
import { useTooltip } from "../../useTooltip"
import { Icon } from "../Sidebar/icons"

/**
 * Back and forward through the screens the reader has been on.
 *
 * Shown on every screen with a history, rather than only in the editor: an
 * index page is somewhere you have been, and until it was recorded the arrow
 * could not be drawn there at all.
 *
 * Neither arrow keeps a space it cannot use. Back used to sit greyed out on a
 * fresh note, which is a control announcing it does nothing.
 */
export function HistoryNav() {
  // Selecting booleans keeps this out of the re-render path for scroll updates,
  // which touch history on every frame.
  const hasBack = useNotesStore((state) => canGoBack(state.history))
  const hasForward = useNotesStore((state) => canGoForward(state.history))
  const back = useNotesStore((state) => state.back)
  const forward = useNotesStore((state) => state.forward)
  const tip = useTooltip()

  return (
    <>
      {hasBack && (
        <button
          type="button"
          className="icon-button"
          {...tip("Back")}
          aria-label="Back"
          onClick={() => void back()}
        >
          <Icon name="back" className="nav-icon" />
        </button>
      )}

      {hasForward && (
        <button
          type="button"
          className="icon-button"
          {...tip("Forward")}
          aria-label="Forward"
          onClick={() => void forward()}
        >
          <Icon name="back" className="nav-icon nav-icon-forward" />
        </button>
      )}
    </>
  )
}

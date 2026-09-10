import { useEffect, useRef } from "react"
import { useSuspendWindowDrag } from "../../useWindowDrag"

interface ConfirmDialogProps {
  title: string
  /** One sentence saying what happens, and whether it can be undone. */
  body: string
  confirmLabel: string
  /** Colours the confirm button and nothing else. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The app's own confirm, rather than `window.confirm` — that one is drawn by
 * Chromium, ignores the theme, says "localhost:5173 says", and cannot be
 * screenshotted or styled.
 *
 * Cancel takes focus rather than the confirm button. Every use of this is
 * destructive, so a stray Return should do nothing.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useSuspendWindowDrag()

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onCancel()
        return
      }

      // A dialog that lets Tab wander back to the page behind it is a dialog
      // in name only. Two controls, so the cycle is just first and last.
      if (event.key !== "Tab") return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button")
      if (focusable === undefined || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onCancel])

  return (
    <div
      className="confirm-backdrop"
      // A click that misses the panel is a click away from it, which is a
      // cancel — the same as clicking off any other popup here.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="confirm-panel"
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 className="confirm-title" id="confirm-title">
          {title}
        </h2>
        <p className="confirm-body" id="confirm-body">
          {body}
        </p>

        <div className="confirm-actions">
          <button type="button" className="settings-button" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`settings-button ${destructive ? "settings-button-danger" : "settings-button-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

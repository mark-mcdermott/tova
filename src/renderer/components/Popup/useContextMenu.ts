import { MouseEvent, useCallback, useState } from "react"

export interface MenuPosition {
  x: number
  y: number
}

/**
 * Right-click position state for one menu. Propagation is stopped so a menu on
 * a row wins over the empty-area menu behind it.
 */
export function useContextMenu() {
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const open = useCallback((event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setPosition({ x: event.clientX, y: event.clientY })
  }, [])

  const close = useCallback(() => setPosition(null), [])

  return { position, open, close }
}

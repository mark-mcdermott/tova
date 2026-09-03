import { useEffect, useLayoutEffect, useRef, useState } from "react"

export interface MenuItem {
  label: string
  onSelect: () => void
  destructive?: boolean
}

interface MenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

const EDGE_GAP = 8

/**
 * The shared popup menu — context menus, the editor `...` menu and every later
 * dropdown use this one component rather than each growing their own.
 */
export function Menu({ x, y, items, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // Measure after paint so a menu opened near an edge flips back into view.
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return

    const { width, height } = element.getBoundingClientRect()
    setPosition({
      left: Math.min(x, window.innerWidth - width - EDGE_GAP),
      top: Math.min(y, window.innerHeight - height - EDGE_GAP)
    })
  }, [x, y])

  useEffect(() => {
    ref.current?.querySelector("button")?.focus()

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="popup-menu"
      role="menu"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.destructive === true ? "is-destructive" : undefined}
          onClick={() => {
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

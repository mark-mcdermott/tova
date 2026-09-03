import { ReactNode, useState } from "react"

interface DisclosureProps {
  label: string
  count?: number
  defaultOpen?: boolean
  variant?: "section" | "group"
  onActivate?: () => void
  children: ReactNode
}

/**
 * The one collapsible primitive the sidebar uses, for both the FOLDERS/TAGS
 * headers and each folder inside them. Open state is deliberately not persisted
 * — the spec calls for folders to start collapsed on every launch.
 */
export function Disclosure({
  label,
  count,
  defaultOpen = false,
  variant = "group",
  onActivate,
  children
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`disclosure disclosure-${variant}`}>
      <button
        type="button"
        className="disclosure-header"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current)
          onActivate?.()
        }}
      >
        <span className={`disclosure-arrow${open ? " is-open" : ""}`} aria-hidden="true">
          ▸
        </span>
        <span className="disclosure-label">{label}</span>
        {count !== undefined && <span className="disclosure-count">{count}</span>}
      </button>

      {open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

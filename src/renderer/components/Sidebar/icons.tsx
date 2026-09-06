import type { ReactElement } from "react"

interface IconProps {
  name: "notes" | "daily" | "trash" | "folder" | "tag"
}

/**
 * Sidebar glyphs. Inline SVG rather than an icon package — five shapes at one
 * size does not justify a dependency, and these inherit currentColor.
 */
const PATHS: Record<IconProps["name"], ReactElement> = {
  notes: (
    <>
      <rect x="3.5" y="2.5" width="9" height="11" rx="1.5" />
      <path d="M6 6h4M6 8.5h4M6 11h2.5" />
    </>
  ),
  daily: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2" />
    </>
  ),
  folder: <path d="M2.5 4.5h4l1.2 1.5h5.8v6.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z" />,
  tag: <path d="M8 2.5H3.5a1 1 0 0 0-1 1V8l5.5 5.5 5.5-5.5z" />
}

export function Icon({ name }: IconProps) {
  return (
    <svg
      className="sidebar-icon"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

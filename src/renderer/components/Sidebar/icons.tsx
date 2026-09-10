import type { ReactElement } from "react"

interface IconProps {
  name:
    | "notes"
    | "daily"
    | "ideas"
    | "posts"
    | "journal"
    | "trash"
    | "folder"
    | "tag"
    | "cog"
    | "compose"
    | "back"
    | "star"
    | "more"
    | "search"
    | "sun"
    | "moon"
    | "monitor"
  className?: string
}

/**
 * Sidebar glyphs. Inline SVG rather than an icon package — five shapes at one
 * size does not justify a dependency, and these inherit currentColor.
 */
const PATHS: Record<IconProps["name"], ReactElement> = {
  sun: (
    <>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.6v1.6M8 12.8v1.6M2.5 2.5l1.1 1.1M12.4 12.4l1.1 1.1M1.6 8h1.6M12.8 8h1.6M2.5 13.5l1.1-1.1M12.4 3.6l1.1-1.1" />
    </>
  ),
  moon: <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />,
  // A screen, which is the glyph light and dark pickers use for "whatever the
  // machine is set to".
  monitor: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1.3" />
      <path d="M6 13.5h4M8 11v2.5" />
    </>
  ),
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
  // A lightbulb reads as an idea; a star reads as a favourite, which is a
  // different thing and is what the breadcrumb row uses.
  ideas: (
    <>
      <path d="M8 1.9a4.1 4.1 0 0 0-2.4 7.4c.5.4.8 1 .8 1.6v.3h3.2v-.3c0-.6.3-1.2.8-1.6A4.1 4.1 0 0 0 8 1.9Z" />
      <path d="M6.6 13.2h2.8M7 14.4h2" />
    </>
  ),
  star: <path d="m8 2.2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.6z" />,
  back: <path d="M12.8 8H3.6M7.2 4.2 3.4 8l3.8 3.8" />,
  more: (
    <>
      <circle cx="8" cy="8" r="6.1" />
      <circle cx="5.3" cy="8" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="10.7" cy="8" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
  // A page with a corner turned up: a published piece rather than a note.
  posts: (
    <>
      <path d="M3.5 2.5h6l3 3v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" />
      <path d="M9.5 2.5v3h3" />
    </>
  ),
  journal: (
    <>
      <path d="M3.5 2.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M5.5 2.5v11M7.6 5.6h3M7.6 8h3" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.1 10.1 13.5 13.5" />
    </>
  ),
  tag: <path d="M8 2.5H3.5a1 1 0 0 0-1 1V8l5.5 5.5 5.5-5.5z" />,
  // Drawn on a 24 grid and scaled to the shared 16 viewBox: radial spokes read
  // as a sun at this size, whereas a toothed ring reads as a cog.
  cog: (
    <g transform="scale(0.6667)">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </g>
  ),
  // Square-and-pencil, as the mockup's compose control has it.
  compose: (
    <>
      <path d="M12.6 8.9V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4.9A1.5 1.5 0 0 1 4 3.4h3.1" />
      <path d="M13.4 2.6a1.13 1.13 0 0 1 0 1.6L9.1 8.5l-2.1.5.5-2.1 4.3-4.3a1.13 1.13 0 0 1 1.6 0Z" />
    </>
  )
}

/**
 * The sidebar's collapse and reveal carets. Sized in CSS rather than by
 * attribute so both track the toolbar glyphs from a single token.
 */
export function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="caret-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M9.5 3 5 8l4.5 5" : "M6.5 3 11 8l-4.5 5"} />
    </svg>
  )
}

export function Icon({ name, className = "sidebar-icon" }: IconProps) {
  return (
    <svg
      className={className}
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

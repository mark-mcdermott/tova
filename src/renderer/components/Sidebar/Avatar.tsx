interface AvatarProps {
  /** Data URL of the stored picture, or null to fall back to initials. */
  src: string | null
  name: string
  className: string
}

/** Two letters at most: more stops reading as a mark and starts reading as text. */
function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter((word) => word !== "")
  if (words.length === 0) return ""
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * A hue from the name, so the same person keeps the same colour between
 * launches without anything being stored for it.
 */
function hueOf(name: string): number {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 360
  return hash
}

/**
 * The account picture where there is one, initials where there is not. No
 * bundled portrait stands in: a stranger's face is a worse default than a
 * letter, and it would ship in every copy of the app.
 */
export function Avatar({ src, name, className }: AvatarProps) {
  if (src !== null) return <img className={className} src={src} alt="" />

  const initials = initialsOf(name)
  const hue = hueOf(name)

  return (
    <span
      className={`${className} avatar-initials`}
      aria-hidden="true"
      style={{ background: `hsl(${hue} 42% 52%)` }}
    >
      {initials}
    </span>
  )
}

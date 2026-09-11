import { discColor, initialsOf } from "../../avatar"

interface AvatarProps {
  /** Data URL of the stored picture, or null to fall back to initials. */
  src: string | null
  name: string
  className: string
  /** The disc behind it, or null to take a colour from the name. */
  color?: string | null
}

/**
 * The account picture where there is one, initials where there is not. No
 * bundled portrait stands in: a stranger's face is a worse default than a
 * letter, and it would ship in every copy of the app.
 *
 * The disc is painted on whatever is drawn, pictures included. A photograph
 * covers it and a robot with nothing behind it does not, which is the whole
 * point: the colour is the robot's background as much as the initials'.
 */
export function Avatar({ src, name, className, color = null }: AvatarProps) {
  const background = discColor(color)

  if (src !== null) return <img className={className} src={src} alt="" style={{ background }} />

  const initials = initialsOf(name)

  // No name to take a letter from, so Tova signs it with its own t.
  if (initials === "") {
    return (
      <span className={`${className} avatar-initials`} aria-hidden="true" style={{ background }}>
        <span className="avatar-wordmark" />
      </span>
    )
  }

  return (
    <span className={`${className} avatar-initials`} aria-hidden="true" style={{ background }}>
      {initials}
    </span>
  )
}

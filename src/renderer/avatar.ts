import { AvatarChoice, AvatarSources } from "../shared/preferences"
import tovaAvatar from "./assets/avatars/tova.png"

/** What a disc is painted until someone says otherwise. */
export const DEFAULT_DISC = "#3196c9"

/** Two letters at most: more stops reading as a mark and starts reading as text. */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter((word) => word !== "")
  if (words.length === 0) return ""
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * What the disc behind the initials is painted, as hex — which is also what the
 * colour input speaks, so the swatch and the disc cannot disagree about what
 * colour is in use.
 *
 * One colour for everyone until they pick another. It used to be a hue hashed
 * out of the name, which was a nice trick with nothing to say for itself once
 * there was a picker: a reader who wanted maroon could not ask for it, and one
 * who did not could not say so either.
 */
export function discColor(color: string | null): string {
  return color ?? DEFAULT_DISC
}

/** Tova's robot, drawn for this and no other purpose. */
export const tovaAvatarUrl = tovaAvatar

/**
 * What to draw for a choice, or null for the initials — which are drawn rather
 * than fetched, and stand in whenever a picture has gone missing underneath a
 * choice that wanted it.
 */
export function resolveAvatar(choice: AvatarChoice, sources: AvatarSources): string | null {
  if (choice === "tova") return tovaAvatarUrl
  if (choice === "system") return sources.system
  if (choice === "custom") return sources.custom
  return null
}

/**
 * Whether a choice has anything behind it. A Mac with no account picture, or a
 * reader who has never chosen one, should not be offered the empty option.
 */
export function offersAvatar(choice: AvatarChoice, sources: AvatarSources): boolean {
  if (choice === "system") return sources.system !== null
  if (choice === "custom") return sources.custom !== null
  return true
}

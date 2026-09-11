import { AvatarChoice, AvatarSources } from "../shared/preferences"
import tovaAvatar from "./assets/avatars/tova.jpg"

/** The robot from the app icon, cropped to its head. */
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

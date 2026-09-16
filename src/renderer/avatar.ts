import { AvatarChoice, AvatarSources } from "../shared/preferences"
import tovaAvatar from "./assets/avatars/tova.png"

/**
 * What a disc is painted until someone says otherwise: the yellow out of the
 * middle of a bokeh circle in the light background, at the foot of the
 * right-hand mountain. Sampled from the picture rather than chosen beside it,
 * so the two belong to each other rather than merely coexisting.
 */
export const DEFAULT_DISC = "#d9c25e"

/** Ink dark enough to read on a light disc; the disc's own opposite otherwise. */
const DARK_INK = "#2b2733"
const LIGHT_INK = "#ffffff"

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

/*
 * Which ink the initials take, decided by the disc rather than fixed.
 *
 * White was written into the stylesheet, which was fine for one blue and for
 * nothing else — and the colour has been the reader's to choose for a while.
 * Pick any pale colour today and your initials go with it. The default being a
 * yellow makes that immediate: white on it is 1.78:1, which is not far off the
 * 1.74:1 that made every popup row look disabled.
 */
export function discInk(color: string | null): string {
  const hex = discColor(color).replace("#", "")
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return LIGHT_INK

  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)

  const against = (ink: number) => {
    const [hi, lo] = luminance > ink ? [luminance, ink] : [ink, luminance]
    return (hi + 0.05) / (lo + 0.05)
  }
  // 1.0 is white's luminance; DARK_INK's, worked out the same way, is 0.0243.
  return against(1) >= against(0.0243) ? LIGHT_INK : DARK_INK
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

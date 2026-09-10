/**
 * Bundled background photographs, in a folder each.
 *
 * A photograph suits one mode or the other, not both: a bright sky cannot carry
 * white text and a night sky cannot carry black. The folder an image sits in is
 * what says which — no manifest to keep in step, and dropping a file into the
 * right one is still all it takes.
 */
const lightModules = import.meta.glob<string>("./assets/backgrounds/light/*.jpg", {
  eager: true,
  query: "?url",
  import: "default"
})

const darkModules = import.meta.glob<string>("./assets/backgrounds/dark/*.jpg", {
  eager: true,
  query: "?url",
  import: "default"
})

const urlsOf = (modules: Record<string, string>): string[] =>
  Object.keys(modules)
    .sort()
    .map((key) => modules[key])

export const lightBackgroundUrls: string[] = urlsOf(lightModules)
export const darkBackgroundUrls: string[] = urlsOf(darkModules)

/** Every bundled photograph, for resolving a stored name whatever mode it was for. */
export const backgroundUrls: string[] = [...lightBackgroundUrls, ...darkBackgroundUrls]

/** The ones offered for a mode. */
export function bundledFor(theme: "light" | "dark"): string[] {
  return theme === "dark" ? darkBackgroundUrls : lightBackgroundUrls
}

export function pickBackground(
  urls: string[] = backgroundUrls,
  random: () => number = Math.random
): string | null {
  if (urls.length === 0) return null
  // random() can return values arbitrarily close to 1; clamp rather than trust it.
  const index = Math.min(Math.floor(random() * urls.length), urls.length - 1)
  return urls[index]
}

/**
 * One photograph is bundled today, so this resolves to it. The picker stays
 * because the glob still drives the list — dropping a second image into the
 * folder is all it takes to have one chosen per launch again.
 */
export function applyBackground(url: string | null = pickBackground()): void {
  const root = document.documentElement
  // Cleared rather than left behind: none means none, and the gradient beneath
  // is what shows. A light photograph left up in dark mode would put white text
  // on a bright sky, which no ink colour rescues.
  if (url === null) root.style.removeProperty("--bg-photo")
  else root.style.setProperty("--bg-photo", `url("${url}")`)
}

/** Where an added background is served from — see the tova-bg scheme in main. */
export function userBackgroundUrl(name: string): string {
  return `tova-bg://local/${encodeURIComponent(name)}`
}

/**
 * The URL for a stored filename: bundled first, then the ones the reader added,
 * then null when the file is gone from both.
 */
export function backgroundByName(name: string, added: string[] = []): string | null {
  const bundled = backgroundUrls.find((url) => url.endsWith(`/${name}`))
  if (bundled !== undefined) return bundled
  return added.includes(name) ? userBackgroundUrl(name) : null
}

/**
 * Stored where a filename would be. It cannot collide with one: every
 * background is a file with an extension, and this has none.
 */
export const SHUFFLE = "shuffle"

/**
 * Everything a mode could shuffle between: the photographs bundled for it, then
 * the ones the reader added — those are offered to both, since only the reader
 * knows whether an image of their own suits one mode or the other.
 */
export function allBackgroundUrls(theme: "light" | "dark", added: string[] = []): string[] {
  return [...bundledFor(theme), ...added.map(userBackgroundUrl)]
}

/**
 * Whether the picker offers Shuffle.
 *
 * With one picture there is nothing to shuffle between. It is still offered
 * where it is already the choice stored, or the picker would show nothing
 * chosen at all — which happens to a reader who shuffled and then removed
 * pictures until one was left.
 */
export function showsShuffle(count: number, chosen: string | null): boolean {
  return count > 1 || chosen === SHUFFLE
}

/**
 * What to paint. Null is the gradient, in either theme — it used to mean the
 * gradient in dark and a shuffle in light, which is why the two pickers could
 * not look the same. Shuffle says shuffle now, and says it in both.
 *
 * A name that no longer resolves falls back to the gradient rather than to a
 * photograph the reader did not choose.
 */
export function resolveBackground(
  chosen: string | null,
  theme: "light" | "dark",
  added: string[] = []
): string | null {
  // The mode is back, for a different reason than it left: null means the same
  // thing in both now, but a shuffle draws from that mode's own photographs.
  if (chosen === SHUFFLE) return pickBackground(allBackgroundUrls(theme, added))
  if (chosen === null) return null
  return backgroundByName(chosen, added)
}

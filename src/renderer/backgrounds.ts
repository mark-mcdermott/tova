/**
 * Bundled background photographs. Globbed rather than listed, so dropping a new
 * image into the folder is all it takes to add it to the rotation.
 */
const modules = import.meta.glob<string>("./assets/backgrounds/*.jpg", {
  eager: true,
  query: "?url",
  import: "default"
})

export const backgroundUrls: string[] = Object.keys(modules)
  .sort()
  .map((key) => modules[key])

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
  // Cleared rather than left behind: in dark mode with no dark photograph, the
  // light one behind white text is unreadable, and the gradient underneath is
  // built for exactly that case.
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

/** Everything that could be chosen: what ships, then what was added. */
export function allBackgroundUrls(added: string[] = []): string[] {
  return [...backgroundUrls, ...added.map(userBackgroundUrl)]
}

/**
 * What to paint. Null is the gradient, in either theme — it used to mean the
 * gradient in dark and a shuffle in light, which is why the two pickers could
 * not look the same. Shuffle says shuffle now, and says it in both.
 *
 * A name that no longer resolves falls back to the gradient rather than to a
 * photograph the reader did not choose.
 */
export function resolveBackground(chosen: string | null, added: string[] = []): string | null {
  if (chosen === SHUFFLE) return pickBackground(allBackgroundUrls(added))
  if (chosen === null) return null
  return backgroundByName(chosen, added)
}

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
  if (url === null) return
  document.documentElement.style.setProperty("--bg-photo", `url("${url}")`)
}

/** The URL for a stored filename, or null when it is no longer bundled. */
export function backgroundByName(name: string): string | null {
  return backgroundUrls.find((url) => url.endsWith(`/${name}`)) ?? null
}

/**
 * A chosen background wins; anything else — no choice, or a choice whose file
 * is no longer bundled — falls back to picking one.
 */
export function resolveBackground(chosen: string | null): string | null {
  if (chosen === null) return pickBackground()
  return backgroundByName(chosen) ?? pickBackground()
}

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
 * Chosen once per launch, never mid-session — the background is scenery, and
 * changing it while someone is writing would be the opposite of calm.
 */
export function applyBackground(url: string | null = pickBackground()): void {
  if (url === null) return
  document.documentElement.style.setProperty("--bg-photo", `url("${url}")`)
}

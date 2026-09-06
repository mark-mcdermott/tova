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

/** Where the rotation currently sits, so cycling continues from what is shown. */
let position = -1

/**
 * Chosen once per launch rather than on a timer — the background is scenery,
 * and changing it unbidden while someone is writing would be the opposite of
 * calm. Stepping through deliberately is another matter; see cycleBackground.
 */
export function applyBackground(url: string | null = pickBackground()): void {
  if (url === null) return
  const at = backgroundUrls.indexOf(url)
  if (at !== -1) position = at
  document.documentElement.style.setProperty("--bg-photo", `url("${url}")`)
}

/** Advances to the next photograph and applies it. Wraps at the end. */
export function cycleBackground(urls: string[] = backgroundUrls): string | null {
  if (urls.length === 0) return null
  position = (position + 1) % urls.length
  const url = urls[position]
  applyBackground(url)
  return url
}

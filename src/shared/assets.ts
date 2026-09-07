/** Where images dropped into a note are kept, relative to the vault root. */
export const ASSETS_DIRECTORY = "assets"

/** Extensions Chromium renders inline. Anything else is refused rather than
 *  written into the vault under a name that implies it will display. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i

/**
 * Path from a note's own directory to a vault-relative asset. Relative rather
 * than rooted, so the markdown keeps working in any other editor opened on the
 * vault, and survives the whole vault being moved.
 */
export function assetLink(noteId: string, assetPath: string): string {
  const depth = noteId.split("/").length - 1
  return `${"../".repeat(depth)}${assetPath}`
}

/**
 * The inverse: turns an image URL found in a note back into a vault-relative
 * path. Returns null for anything that is not the vault's to serve — remote
 * URLs, data URIs, and paths that climb out past the root.
 */
export function resolveAssetPath(noteId: string, url: string): string | null {
  if (url === "" || url.startsWith("//") || ABSOLUTE_URL.test(url)) return null

  const raw = url.startsWith("/")
    ? url.slice(1).split("/")
    : [...noteId.split("/").slice(0, -1), ...url.split("/")]

  const segments: string[] = []
  for (const segment of raw) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return segments.length === 0 ? null : segments.join("/")
}

/** The privileged scheme the main process serves vault files on. */
export function assetUrl(vaultPath: string): string {
  const encoded = vaultPath.split("/").map(encodeURIComponent).join("/")
  return `tova-asset://vault/${encoded}`
}

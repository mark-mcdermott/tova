import { app, dialog } from "electron"
import { copyFile, mkdir, readdir, readFile, unlink } from "fs/promises"
import { extname, join, resolve, sep } from "path"
import { slugify } from "../shared/noteName"

/*
 * The formats a browser engine will actually decode. .otf and .ttf cover what
 * people have on disk; woff2 covers what they downloaded from a foundry.
 */
const ALLOWED = [".otf", ".ttf", ".woff", ".woff2"]

export function titleFontsDir(): string {
  return join(app.getPath("userData"), "fonts")
}

/**
 * The single choke point for turning a stored filename into a path, the same
 * discipline the vault and the backgrounds use: a name that resolves outside
 * the directory is refused rather than clamped.
 */
export function resolveTitleFont(name: string): string {
  const root = titleFontsDir()
  const target = resolve(root, name)

  if (!target.startsWith(root + sep)) throw new Error("Refusing to read outside the fonts")
  return target
}

/** Filenames the reader has added, in a stable order. */
export async function listTitleFonts(): Promise<string[]> {
  try {
    const entries = await readdir(titleFontsDir())
    return entries.filter((name) => ALLOWED.includes(extname(name).toLowerCase())).sort()
  } catch (error) {
    // No directory yet simply means none have been added; anything else is a
    // real fault and should not look like an empty shelf.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return []
  }
}

/**
 * Copies a chosen font in and returns its stored name, or null if the reader
 * cancelled. Copied rather than referenced, so a title face does not vanish
 * because the original was moved out of Downloads.
 */
export async function addTitleFont(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Add a title font",
    properties: ["openFile"],
    filters: [{ name: "Fonts", extensions: ["otf", "ttf", "woff", "woff2"] }]
  })

  const source = filePaths[0]
  if (canceled || source === undefined) return null

  const extension = extname(source).toLowerCase()
  if (!ALLOWED.includes(extension)) {
    throw new Error(`Tova cannot use ${extension} as a title font`)
  }

  const stem = slugify(source.split(sep).pop()?.replace(extension, "") ?? "title-font")
  const taken = new Set(await listTitleFonts())

  // A second file of the same name is a different face, not a replacement.
  let filename = `${stem || "title-font"}${extension}`
  for (let n = 2; taken.has(filename); n++) filename = `${stem}-${n}${extension}`

  await mkdir(titleFontsDir(), { recursive: true })
  await copyFile(source, resolveTitleFont(filename))
  return filename
}

const MIME: Record<string, string> = {
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
}

/**
 * An added face as a data URL, or null when it is gone.
 *
 * Not a custom scheme, though that is how backgrounds are served: the renderer
 * runs from file://, and Chromium refuses cross-origin *font* requests from
 * there to any scheme but a handful of built-in ones — no response header can
 * lift that, because the blocked origin is the page's, not the font's. Images
 * are not fetched under CORS, which is why the backgrounds' scheme is fine.
 *
 * This is the same answer avatarDataUrl already gives for the same reason: one
 * file, read once, and the renderer caches the FontFace after that.
 */
export async function titleFontDataUrl(name: string): Promise<string | null> {
  const extension = extname(name).toLowerCase()
  if (!ALLOWED.includes(extension)) return null

  try {
    const bytes = await readFile(resolveTitleFont(name))
    return `data:${MIME[extension]};base64,${bytes.toString("base64")}`
  } catch {
    // Removed underneath us; the stack in globals.css stands in.
    return null
  }
}

/** Removes an added face. Bundled ones are not files and never reach here. */
export async function removeTitleFont(name: string): Promise<void> {
  await unlink(resolveTitleFont(name))
}

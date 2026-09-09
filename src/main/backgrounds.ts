import { app, dialog } from "electron"
import { copyFile, mkdir, readdir } from "fs/promises"
import { extname, join, resolve, sep } from "path"
import { slugify } from "../shared/noteName"

const ALLOWED = [".png", ".jpg", ".jpeg", ".webp"]

export function backgroundsDir(): string {
  return join(app.getPath("userData"), "backgrounds")
}

/**
 * The single choke point for turning a stored filename into a path, the same
 * discipline the vault uses: a name that resolves outside the directory is
 * refused rather than clamped.
 */
export function resolveBackground(name: string): string {
  const root = backgroundsDir()
  const target = resolve(root, name)

  if (!target.startsWith(root + sep)) throw new Error("Refusing to read outside the backgrounds")
  return target
}

/** Filenames the reader has added, in a stable order. */
export async function listBackgrounds(): Promise<string[]> {
  try {
    const entries = await readdir(backgroundsDir())
    return entries.filter((name) => ALLOWED.includes(extname(name).toLowerCase())).sort()
  } catch (error) {
    // No directory yet simply means none have been added; anything else is a
    // real fault and should not look like an empty shelf.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return []
  }
}

/**
 * Copies a chosen image in and returns its stored name, or null if the reader
 * cancelled. Copied rather than referenced: a background that vanishes because
 * the original was moved is a worse surprise than the disk it costs.
 */
export async function addBackground(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Add a background",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  })

  const source = filePaths[0]
  if (canceled || source === undefined) return null

  const extension = extname(source).toLowerCase()
  if (!ALLOWED.includes(extension)) {
    throw new Error(`Tova cannot use ${extension} as a background`)
  }

  const stem = slugify(source.split(sep).pop()?.replace(extension, "") ?? "background")
  const taken = new Set(await listBackgrounds())

  // A second file of the same name is a different picture, not a replacement.
  let filename = `${stem || "background"}${extension}`
  for (let n = 2; taken.has(filename); n++) filename = `${stem}-${n}${extension}`

  await mkdir(backgroundsDir(), { recursive: true })
  await copyFile(source, resolveBackground(filename))
  return filename
}

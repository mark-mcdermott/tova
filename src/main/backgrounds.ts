import { app, dialog } from "electron"
import { copyFile, mkdir, readdir } from "fs/promises"
import { extname, join, resolve, sep } from "path"
import { slugify } from "../shared/noteName"

const ALLOWED = [".png", ".jpg", ".jpeg", ".webp"]

export type BackgroundTheme = "light" | "dark"

export function backgroundsDir(): string {
  return join(app.getPath("userData"), "backgrounds")
}

/*
 * A folder each, as the bundled photographs have. The reader picks a picture by
 * clicking the + in one row or the other, which says which mode they meant it
 * for — a bright sky cannot carry white text, and the reverse.
 */
function themeDir(theme: BackgroundTheme): string {
  return join(backgroundsDir(), theme)
}

/**
 * The single choke point for turning a stored filename into a path, the same
 * discipline the vault uses: a name that resolves outside the directory is
 * refused rather than clamped.
 */
export function resolveBackground(name: string, theme: BackgroundTheme): string {
  const root = themeDir(theme)
  const target = resolve(root, name)

  if (!target.startsWith(root + sep)) throw new Error("Refusing to read outside the backgrounds")
  return target
}

/**
 * Where a stored name lives, without being told which mode it was added for.
 * Preferences hold a bare filename, so the two folders are searched — and
 * addBackground keeps names unique across both, so there is one answer.
 */
export async function findBackground(name: string): Promise<string | null> {
  for (const theme of ["light", "dark"] as const) {
    const names = await listBackgrounds(theme)
    if (names.includes(name)) return resolveBackground(name, theme)
  }
  return null
}

/** Filenames the reader has added for a mode, in a stable order. */
export async function listBackgrounds(theme: BackgroundTheme): Promise<string[]> {
  try {
    const entries = await readdir(themeDir(theme))
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
export async function addBackground(theme: BackgroundTheme): Promise<string | null> {
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
  // Unique across both folders, not just this one: a stored preference is a
  // bare filename, so two pictures sharing a name would be one answer to two
  // questions.
  const taken = new Set([...(await listBackgrounds("light")), ...(await listBackgrounds("dark"))])

  // A second file of the same name is a different picture, not a replacement.
  let filename = `${stem || "background"}${extension}`
  for (let n = 2; taken.has(filename); n++) filename = `${stem}-${n}${extension}`

  await mkdir(themeDir(theme), { recursive: true })
  await copyFile(source, resolveBackground(filename, theme))
  return filename
}

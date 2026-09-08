import { app, dialog } from "electron"
import { copyFile, readFile } from "fs/promises"
import { extname, join } from "path"
import { readPreferences, writePreferences } from "./preferences"

/*
 * The avatar is copied into the app's data directory rather than referenced
 * where the user picked it: a portrait that vanishes because a folder moved is
 * a poor way to find out how the reference worked.
 */

const ALLOWED = [".png", ".jpg", ".jpeg", ".webp"]

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
}

function avatarPath(file: string): string {
  return join(app.getPath("userData"), file)
}

export async function chooseAvatar(): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Choose a picture",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  })

  const source = filePaths[0]
  if (canceled || source === undefined) return null

  const extension = extname(source).toLowerCase()
  if (!ALLOWED.includes(extension)) throw new Error(`Tova cannot use ${extension} for an avatar`)

  // A fixed name per format, so replacing a picture never leaves the old one.
  const filename = `avatar${extension}`
  await copyFile(source, avatarPath(filename))

  const preferences = await readPreferences()
  await writePreferences({ ...preferences, avatarFile: filename })
  return filename
}

/**
 * Returned as a data URL: the file lives outside the vault, so the asset
 * protocol does not reach it, and this is one small image read once.
 */
export async function avatarDataUrl(): Promise<string | null> {
  const { avatarFile } = await readPreferences()
  if (avatarFile === null) return null

  try {
    const bytes = await readFile(avatarPath(avatarFile))
    const mime = MIME[extname(avatarFile).toLowerCase()] ?? "image/png"
    return `data:${mime};base64,${bytes.toString("base64")}`
  } catch {
    // The file was removed underneath us; the bundled portrait stands in.
    return null
  }
}

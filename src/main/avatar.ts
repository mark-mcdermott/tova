import { app, dialog } from "electron"
import { execFile } from "child_process"
import { copyFile, readFile, writeFile } from "fs/promises"
import { extname, join } from "path"
import { userInfo } from "os"
import { promisify } from "util"
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

const run = promisify(execFile)

/*
 * The macOS account picture. It lives in the directory service as a hex blob
 * under JPEGPhoto — the `Picture` attribute beside it often names a stock image
 * even when the user has set their own, so the blob is the honest source.
 */
async function macAccountPhoto(): Promise<Buffer | null> {
  if (process.platform !== "darwin") return null

  try {
    // execFile, not a shell: the username is interpolated into an argument.
    const { stdout } = await run("dscl", [".", "-read", `/Users/${userInfo().username}`, "JPEGPhoto"])
    const hex = stdout.replace(/^JPEGPhoto:/, "").replace(/\s+/g, "")
    if (hex.length < 8 || hex.length % 2 !== 0) return null

    const bytes = Buffer.from(hex, "hex")
    // FFD8 opens every JPEG; anything else is not a picture we should write.
    return bytes.length > 0 && bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null
  } catch {
    // No dscl, no such attribute, or no picture set.
    return null
  }
}

/**
 * Copies the account picture in as the starting avatar. Like the display name,
 * this is a seed: once written it is an ordinary value the writer can replace
 * or clear.
 */
export async function seedAvatar(): Promise<string | null> {
  const photo = await macAccountPhoto()
  if (photo === null) return null

  const filename = "avatar.jpg"
  await writeFile(avatarPath(filename), photo)
  return filename
}

import { app, dialog } from "electron"
import { execFile } from "child_process"
import { copyFile, readFile } from "fs/promises"
import { extname, join } from "path"
import { userInfo } from "os"
import { promisify } from "util"
import { readPreferences, writePreferences } from "./preferences"
import type { AvatarChoice, AvatarSources } from "../shared/preferences"

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

  // Chosen as well as copied: nobody picks a picture in order to not use it.
  const preferences = await readPreferences()
  await writePreferences({ ...preferences, avatar: "custom", avatarFile: filename })
  return filename
}

async function customDataUrl(): Promise<string | null> {
  const { avatarFile } = await readPreferences()
  if (avatarFile === null) return null

  try {
    const bytes = await readFile(avatarPath(avatarFile))
    const mime = MIME[extname(avatarFile).toLowerCase()] ?? "image/png"
    return `data:${mime};base64,${bytes.toString("base64")}`
  } catch {
    // The file was removed underneath us; the initials stand in.
    return null
  }
}

/**
 * Both fetched pictures, whichever is in use.
 *
 * Both, because the picker draws every option as the face it would give you,
 * and one call rather than two because they are read together at load. Data
 * URLs: neither file is under the vault, so the asset protocol does not reach
 * them, and both are small images read once.
 */
export async function avatarSources(): Promise<AvatarSources> {
  const [system, custom] = await Promise.all([systemDataUrl(), customDataUrl()])
  return { system, custom }
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
    // The absolute path because a packaged app's PATH is not a shell's and
    // need not have /usr/bin in it; maxBuffer because the default 1MB is the
    // size of hex, not of picture, and a large portrait doubles past it.
    const { stdout } = await run(
      "/usr/bin/dscl",
      [".", "-read", `/Users/${userInfo().username}`, "JPEGPhoto"],
      { maxBuffer: 32 * 1024 * 1024 }
    )
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

async function systemDataUrl(): Promise<string | null> {
  const photo = await macAccountPhoto()
  return photo === null ? null : `data:image/jpeg;base64,${photo.toString("base64")}`
}

/**
 * What a fresh install starts on. The account picture if the Mac has one, the
 * initials otherwise — read where it lives rather than copied in, so changing
 * it in System Settings changes it here too.
 */
export async function startingAvatar(): Promise<AvatarChoice> {
  return (await macAccountPhoto()) === null ? "initials" : "system"
}

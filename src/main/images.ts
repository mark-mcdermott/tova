import { mkdir, readdir } from "fs/promises"
import { writeVaultBytes } from "./vaultFile"
import { basename, extname, join } from "path"
import { ASSETS_DIRECTORY, IMAGE_EXTENSIONS } from "../shared/assets"
import { slugify, uniqueSlug } from "../shared/noteName"
import { resolveInVault } from "./vault"

/** Generous enough for a camera original, small enough that a stray drop of a
 *  disk image cannot fill the vault. */
const MAX_IMAGE_BYTES = 32 * 1024 * 1024

const allowed = new Set(IMAGE_EXTENSIONS)

/**
 * Writes a dropped image into the vault's assets directory and returns its
 * vault-relative path. The supplied name is untrusted: only its extension is
 * honoured, and the stem is reduced to a slug, so nothing the renderer sends
 * can steer the write.
 */
export async function saveImage(name: string, bytes: Uint8Array): Promise<string> {
  // The stored name is normalised to lower case, but the stem has to be split
  // off using the extension as it actually appears, or `photo.PNG` keeps it.
  const suffix = extname(name)
  const extension = suffix.toLowerCase()
  if (!allowed.has(extension)) throw new Error(`Tova cannot store ${extension || name} files`)
  if (bytes.byteLength === 0) throw new Error("That image is empty")
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("That image is too large for the vault")

  const directory = resolveInVault(ASSETS_DIRECTORY)
  await mkdir(directory, { recursive: true })

  // Stems are compared without their extension, so a second `photo` lands as
  // `photo-2` even when the two files are different formats.
  const taken = (await readdir(directory)).map((file) => basename(file, extname(file)))
  const stem = uniqueSlug(slugify(basename(name, suffix)), taken)
  const filename = `${stem}${extension}`

  await writeVaultBytes(join(directory, filename), bytes)
  return `${ASSETS_DIRECTORY}/${filename}`
}

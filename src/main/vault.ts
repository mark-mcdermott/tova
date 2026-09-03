import { app } from "electron"
import { join, resolve, sep } from "path"
import { mkdir } from "fs/promises"
import { Section, SECTIONS } from "../shared/types"
import { NoteLocation, parseNoteId, toNoteId } from "../shared/noteLocation"

let cachedRoot: string | null = null

export function vaultRoot(): string {
  if (cachedRoot === null) cachedRoot = join(app.getPath("documents"), "Tova")
  return cachedRoot
}

export async function ensureVault(): Promise<void> {
  for (const section of SECTIONS) {
    await mkdir(join(vaultRoot(), section), { recursive: true })
  }
}

/**
 * The single choke point for turning renderer-supplied strings into paths.
 * Everything the renderer sends is untrusted, so a resolved path that escapes
 * the vault is refused outright rather than clamped.
 */
export function resolveInVault(relativePath: string): string {
  const root = vaultRoot()
  const target = resolve(root, relativePath)

  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Refusing to touch a path outside the vault")
  }
  return target
}

export function requireLocation(id: string): NoteLocation {
  const location = parseNoteId(id)
  if (location === null) throw new Error(`Invalid note id: ${id}`)
  return location
}

export function notePath(location: NoteLocation): string {
  return resolveInVault(toNoteId(location))
}

export function directoryOf(section: Section, folder: string | null): string {
  const parts: string[] = folder === null ? [section] : [section, folder]
  return resolveInVault(parts.join("/"))
}

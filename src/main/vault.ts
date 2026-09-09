import { app } from "electron"
import { join, resolve, sep } from "path"
import { mkdir } from "fs/promises"
import { Section } from "../shared/types"
import { readPreferences } from "./preferences"
/** Posts is not a configurable section: the blogs that sync into it own it. */
const ALWAYS = ["posts"]
import { NoteLocation, parseNoteId, toNoteId } from "../shared/noteLocation"

/** Where a vault lives unless the reader has chosen another. */
export function defaultVaultRoot(): string {
  return join(app.getPath("documents"), "Tova")
}

/*
 * The vault in use. State, not a cache: the reader can hold several and switch
 * between them, so this has to be settable. It is set deliberately at startup
 * and on every switch rather than filled in by whichever call happened to run
 * first — which is the accident an earlier cache here caused.
 */
let active: string | null = null

export function setActiveVault(path: string | null): void {
  active = path
}

export function vaultRoot(): string {
  return active ?? defaultVaultRoot()
}

export async function ensureVault(): Promise<void> {
  const { sections } = await readPreferences()
  const wanted = [...sections.map((section) => section.id), ...ALWAYS]

  for (const section of new Set(wanted)) {
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

import { readdir, mkdir, rename, unlink, stat, rm } from "fs/promises"
import { join } from "path"
import {
  FOLDERED_SECTIONS,
  Note,
  NoteSummary,
  CreateNoteInput,
  MoveNoteInput,
  Section,
  isSection
} from "../shared/types"
import {
  NoteLocation,
  parseNoteId,
  toNoteId,
  trashLocation,
  restoreLocation,
  isValidFolderName,
  sortNotes
} from "../shared/noteLocation"
import { parseFrontMatter, serializeFrontMatter, FrontMatterValue } from "../shared/frontMatter"
import { readVaultText, writeVaultText } from "./vaultFile"
import { compareTitles, slugify, uniqueSlug } from "../shared/noteName"
import { allTags, normalizeManualTags } from "../shared/tags"
import { canDeleteSection } from "../shared/sections"
import { vaultRoot, resolveInVault, requireLocation, notePath, directoryOf } from "./vault"
import { saveVersion } from "./backup"

interface Home {
  section: Section
  folder: string | null
}

interface LoadedNote {
  location: NoteLocation
  /** Where the note belongs — for a trashed note, where it came from. */
  home: Home
  title: string
  body: string
  deletedAt: number | null
  favorite: boolean
  /** The tags the row put in front matter. Prose tags are not in here. */
  manualTags: string[]
  updatedAt: number
  createdAt: number
}

function stem(filename: string): string {
  return filename.replace(/\.md$/, "")
}

function readTimestamp(value: FrontMatterValue | undefined): number | null {
  if (typeof value !== "string") return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

async function load(location: NoteLocation): Promise<LoadedNote> {
  const absolute = notePath(location)
  const [raw, stats] = await Promise.all([readVaultText(absolute), stat(absolute)])
  const { data, body } = parseFrontMatter(raw)

  const home =
    location.section === "trash"
      ? restoreLocation(data, location.filename)
      : { section: location.section, folder: location.folder }

  const recordedTitle = data.title
  const title =
    typeof recordedTitle === "string" && recordedTitle.trim() !== ""
      ? recordedTitle
      : stem(location.filename)

  return {
    location,
    home: { section: home.section, folder: home.folder },
    title,
    body,
    deletedAt: readTimestamp(data.deletedAt),
    favorite: data.favorite === "true",
    manualTags: normalizeManualTags(data.tags),
    updatedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs
  }
}

async function persist(note: LoadedNote): Promise<void> {
  const data: Record<string, FrontMatterValue> = {
    title: note.title,
    section: note.home.section
  }
  if (note.home.folder !== null) data.folder = note.home.folder
  if (note.deletedAt !== null) data.deletedAt = new Date(note.deletedAt).toISOString()
  // Written only when set, so an ordinary note's front matter stays quiet.
  if (note.favorite) data.favorite = "true"
  // Only the tags the reader asked for in the row. The ones written into the
  // prose are the prose, and storing them here as well would be a copy that
  // goes stale the moment the file is edited anywhere else.
  if (note.manualTags.length > 0) data.tags = note.manualTags

  await writeVaultText(notePath(note.location), serializeFrontMatter(data, note.body))
}

function toNote(note: LoadedNote): Note {
  return {
    id: toNoteId(note.location),
    title: note.title,
    section: note.location.section,
    folder: note.location.folder,
    tags: allTags(note.manualTags, note.body),
    manualTags: note.manualTags,
    favorite: note.favorite,
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
    deletedAt: note.deletedAt,
    body: note.body
  }
}

function toSummary(note: LoadedNote): NoteSummary {
  const { body: _body, ...summary } = toNote(note)
  return summary
}

/** Free `.md` filename in `directory`, ignoring the note's own current name. */
async function freeFilename(directory: string, title: string, keep?: string): Promise<string> {
  const entries = await readdir(directory).catch(() => [] as string[])
  const taken = entries.filter((name) => name.endsWith(".md") && name !== keep).map(stem)

  return `${uniqueSlug(slugify(title), taken)}.md`
}

function normalizeFolder(section: Section, folder: string | null | undefined): string | null {
  if (!FOLDERED_SECTIONS.includes(section)) return null
  if (typeof folder !== "string" || !isValidFolderName(folder)) return null
  return folder.trim()
}

async function listLocations(): Promise<NoteLocation[]> {
  const locations: NoteLocation[] = []

  // The vault's own directories rather than the configured list: a section the
  // reader has since removed may still hold notes, and they should still be
  // found rather than quietly disappearing.
  const sections = (await readdir(vaultRoot(), { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && isSection(entry.name))
    .map((entry) => entry.name)
    .sort()

  for (const section of sections) {
    const sectionDir = resolveInVault(section)
    const entries = await readdir(sectionDir, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        locations.push({ section, folder: null, filename: entry.name })
        continue
      }

      // One folder level, and only where a section has them: user folders under
      // Notes, one per blog under Posts. Nothing recurses further.
      if (
        entry.isDirectory() &&
        FOLDERED_SECTIONS.includes(section) &&
        isValidFolderName(entry.name)
      ) {
        const nested = await readdir(join(sectionDir, entry.name), {
          withFileTypes: true
        }).catch(() => [])

        for (const file of nested) {
          if (file.isFile() && file.name.endsWith(".md")) {
            locations.push({ section, folder: entry.name, filename: file.name })
          }
        }
      }
    }
  }

  return locations
}

export async function listNotes(): Promise<NoteSummary[]> {
  const locations = await listLocations()
  const loaded = await Promise.all(locations.map((location) => load(location).catch(() => null)))

  return sortNotes(loaded.filter((note): note is LoadedNote => note !== null).map(toSummary))
}

export async function readNote(id: string): Promise<Note> {
  return toNote(await load(requireLocation(id)))
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const section: Section = input.section === "trash" ? "notes" : input.section
  const folder = normalizeFolder(section, input.folder)
  const title = (input.title ?? "").trim()

  const directory = directoryOf(section, folder)
  await mkdir(directory, { recursive: true })

  // A caller-supplied filename is validated by round-tripping it through the
  // id parser, which is the same check every other entry point uses.
  const location =
    input.filename === undefined
      ? { section, folder, filename: await freeFilename(directory, title) }
      : parseNoteId(toNoteId({ section, folder, filename: input.filename }))

  if (location === null) throw new Error(`Invalid filename: ${input.filename}`)

  await persist({
    location,
    home: { section, folder },
    title,
    body: input.body ?? "",
    deletedAt: null,
    favorite: false,
    manualTags: [],
    updatedAt: Date.now(),
    createdAt: Date.now()
  })

  return toNote(await load(location))
}

/**
 * Saves content, and follows the title with the filename. Daily notes keep
 * their date-based names, and a note that has been emptied of its title keeps
 * whatever filename it already had rather than churning to `untitled`.
 */
export async function writeNote(id: string, title: string, body: string): Promise<NoteSummary> {
  const note = await load(requireLocation(id))

  // Snapshot what is on disk before overwriting it; saveVersion throttles so
  // continuous typing does not burn through the ten version slots.
  const previous = await readVaultText(notePath(note.location)).catch(() => null)
  if (previous !== null) await saveVersion(id, previous)

  note.title = title.trim()
  note.body = body

  await persist(note)

  // Notes only: a synced post's filename is the blog's, and renaming it here
  // would quietly break the mapping to the file it came from.
  const shouldRename =
    note.location.section === "notes" &&
    note.title !== "" &&
    slugify(note.title) !== stem(note.location.filename)

  if (!shouldRename) return toSummary(await load(note.location))

  const directory = directoryOf(note.location.section, note.location.folder)
  const filename = await freeFilename(directory, note.title, note.location.filename)
  const next: NoteLocation = { ...note.location, filename }

  await rename(notePath(note.location), notePath(next))
  return toSummary(await load(next))
}

export async function renameNote(id: string, title: string): Promise<NoteSummary> {
  const note = await load(requireLocation(id))
  return writeNote(id, title, note.body)
}

export async function moveNote(id: string, input: MoveNoteInput): Promise<NoteSummary> {
  const note = await load(requireLocation(id))
  const section: Section = input.section === "trash" ? "notes" : input.section
  const folder = normalizeFolder(section, input.folder)

  const directory = directoryOf(section, folder)
  await mkdir(directory, { recursive: true })

  const filename = await freeFilename(
    directory,
    stem(note.location.filename),
    note.location.filename
  )
  const next: NoteLocation = { section, folder, filename }

  await rename(notePath(note.location), notePath(next))

  const moved = await load(next)
  moved.home = { section, folder }
  await persist(moved)

  return toSummary(await load(next))
}

/** Soft delete. The origin is recorded in front matter so restore can undo it. */
export async function trashNote(id: string): Promise<NoteSummary> {
  const note = await load(requireLocation(id))
  if (note.location.section === "trash") return toSummary(note)

  const trashDir = resolveInVault("trash")
  await mkdir(trashDir, { recursive: true })

  const filename = await freeFilename(trashDir, stem(note.location.filename))
  const next = trashLocation(filename)

  await rename(notePath(note.location), notePath(next))

  const trashed = await load(next)
  trashed.home = { section: note.location.section, folder: note.location.folder }
  trashed.deletedAt = Date.now()
  await persist(trashed)

  return toSummary(await load(next))
}

export async function restoreNote(id: string): Promise<NoteSummary> {
  const note = await load(requireLocation(id))
  if (note.location.section !== "trash") return toSummary(note)

  const home = restoreLocation(
    { section: note.home.section, folder: note.home.folder ?? "" },
    note.location.filename
  )

  // A note can outlive the section it came from. Restoring it into a directory
  // no longer configured would put it somewhere the sidebar cannot show, so it
  // comes back to Notes instead — visible beats faithful here.
  const homeExists = await stat(resolveInVault(home.section))
    .then((entry) => entry.isDirectory())
    .catch(() => false)
  const target: NoteLocation = homeExists ? home : { ...home, section: "notes", folder: null }

  const directory = directoryOf(target.section, target.folder)
  await mkdir(directory, { recursive: true })

  const filename = await freeFilename(directory, stem(target.filename))
  const next: NoteLocation = { ...target, filename }

  await rename(notePath(note.location), notePath(next))

  const restored = await load(next)
  restored.home = { section: next.section, folder: next.folder }
  restored.deletedAt = null
  await persist(restored)

  return toSummary(await load(next))
}

/**
 * Unlinks a note outright, with no Trash step. Internal to the main process —
 * every caller has to justify skipping the recoverable path.
 */
export async function deleteNoteFile(id: string): Promise<void> {
  await unlink(notePath(requireLocation(id)))
}

export async function permanentDelete(id: string): Promise<void> {
  const location = requireLocation(id)
  // Permanent deletion is only ever reachable from Trash.
  if (location.section !== "trash") {
    throw new Error("Only trashed notes can be permanently deleted")
  }
  await deleteNoteFile(id)
}

export async function listFolders(): Promise<string[]> {
  const entries = await readdir(resolveInVault("notes"), { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory() && isValidFolderName(entry.name))
    .map((entry) => entry.name)
    .sort(compareTitles)
}

export async function createFolder(name: string): Promise<string> {
  if (!isValidFolderName(name)) throw new Error(`Invalid folder name: ${name}`)
  const folder = name.trim()
  await mkdir(resolveInVault(`notes/${folder}`), { recursive: true })
  return folder
}

/**
 * Renames a folder and brings the `folder` value in each contained note's front
 * matter along with it, so a later restore from Trash still lands correctly.
 */
export async function renameFolder(from: string, to: string): Promise<string> {
  if (!isValidFolderName(from) || !isValidFolderName(to)) {
    throw new Error(`Invalid folder name: ${from} → ${to}`)
  }

  const source = from.trim()
  const target = to.trim()
  if (source === target) return target

  const targetPath = resolveInVault(`notes/${target}`)
  const taken = await stat(targetPath).then(
    () => true,
    () => false
  )
  if (taken) throw new Error(`A folder named ${target} already exists`)

  await rename(resolveInVault(`notes/${source}`), targetPath)

  const entries = await readdir(targetPath).catch(() => [] as string[])
  for (const filename of entries.filter((name) => name.endsWith(".md"))) {
    const note = await load({ section: "notes", folder: target, filename })
    note.home = { section: "notes", folder: target }
    await persist(note)
  }

  return target
}

/**
 * Removes a folder, moving everything inside it to Trash first. Notes are never
 * destroyed by a folder delete — they stay recoverable like any other deletion.
 */
/**
 * Removes a section's directory, moving whatever it held to Trash first — the
 * same bargain deleting a folder makes. Daily and Trash are refused here as
 * well as in the UI: main does not trust the renderer to have checked.
 */
export async function deleteSection(id: string): Promise<string[]> {
  if (!isSection(id)) throw new Error(`Invalid section: ${id}`)
  if (!canDeleteSection(id) || id === "posts") throw new Error(`${id} cannot be removed`)

  const directory = resolveInVault(id)
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])

  const trashed: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const summary = await trashNote(toNoteId({ section: id, folder: null, filename: entry.name }))
    trashed.push(summary.id)
  }

  await rm(directory, { recursive: true, force: true })
  return trashed
}

/** Makes the directory a newly configured section will keep its notes in. */
export async function createSection(id: string): Promise<void> {
  if (!isSection(id)) throw new Error(`Invalid section: ${id}`)
  await mkdir(resolveInVault(id), { recursive: true })
}

export async function deleteFolder(name: string): Promise<string[]> {
  if (!isValidFolderName(name)) throw new Error(`Invalid folder name: ${name}`)

  const folder = name.trim()
  const directory = resolveInVault(`notes/${folder}`)
  const entries = await readdir(directory).catch(() => [] as string[])

  const trashed: string[] = []
  for (const filename of entries.filter((entry) => entry.endsWith(".md"))) {
    const summary = await trashNote(toNoteId({ section: "notes", folder, filename }))
    trashed.push(summary.id)
  }

  await rm(directory, { recursive: true, force: true })
  return trashed
}

/** Pins a note to the top of its section, or unpins it. */
export async function setFavorite(id: string, favorite: boolean): Promise<NoteSummary> {
  const note = await load(requireLocation(id))
  if (note.favorite === favorite) return toSummary(note)

  note.favorite = favorite
  await persist(note)
  return toSummary(await load(note.location))
}

/**
 * Replaces the tags the row keeps in front matter. Only those: a tag written
 * into the prose stays in the prose, and is read back out of it.
 */
export async function setManualTags(id: string, tags: string[]): Promise<NoteSummary> {
  const note = await load(requireLocation(id))
  const next = normalizeManualTags(tags)

  if (next.join("\u0000") === note.manualTags.join("\u0000")) return toSummary(note)

  note.manualTags = next
  await persist(note)
  return toSummary(await load(note.location))
}

export function vaultLocation(): string {
  return vaultRoot()
}

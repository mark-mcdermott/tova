/**
 * Notes, for a browser.
 *
 * The renderer addresses a note by a vault path — `notes/ideas/river.md` — and
 * the sync keys one by a uuid. Nothing had to be invented to join them: the
 * desktop already writes `title`, `section`, `folder`, `tags`, `favorite` and
 * `uid` into front matter, so everything needed to place a note already
 * travels inside the ciphertext. `restoreLocation` turns that into a location
 * and `toNoteId` turns that into the path.
 *
 * Which means a path here is **derived, not stored**. Rename a note and its id
 * changes, exactly as it does on the desktop where the file is renamed under
 * it.
 *
 * One thing does not travel. The desktop reads `createdAt` and `updatedAt` off
 * the filesystem, and it rebuilds front matter from the keys it knows when it
 * saves — so a key the web added would be dropped the next time the desktop
 * touched that note. The times are kept beside the note on this device
 * instead, which makes them "when this browser last saw it change". For
 * sorting a list that is what a reader means anyway, and `forgetNotes` takes
 * them with everything else.
 */

import {
  parseFrontMatter,
  serializeFrontMatter,
  type FrontMatterValue
} from "../../../src/shared/frontMatter"
import { slugify, uniqueSlug } from "../../../src/shared/noteName"
import { restoreLocation, sortNotes, toNoteId } from "../../../src/shared/noteLocation"
import { allTags, normalizeManualTags } from "../../../src/shared/tags"
import type { NoteStore, StoredNote } from "../../../src/shared/noteStore"
import type { CreateNoteInput, Note, NoteApi, NoteSummary } from "../../../src/shared/types"
import { notYet, unavailable } from "./refuse"

/** What this device keeps about a note beyond what the sync carries. */
export interface WebNote extends StoredNote {
  createdAt: number
  updatedAt: number
}

const TRASH = "trash"

const times = (note: StoredNote): { createdAt: number; updatedAt: number } => {
  const web = note as Partial<WebNote>
  const seen = web.updatedAt ?? 0
  return { createdAt: web.createdAt ?? seen, updatedAt: seen }
}

/**
 * Every note, with the path the renderer will call it by.
 *
 * Sorted by uid before filenames are handed out, so two devices with the same
 * notes agree about which of two identical titles gets the bare slug and which
 * gets the suffix. Iteration order would otherwise decide it, and iteration
 * order is not a thing two devices share.
 */
interface Indexed {
  note: StoredNote
  summary: NoteSummary
  body: string
  /**
   * Where the note lives when it is not in the Trash.
   *
   * Not the same as `summary.section`, which is what the sidebar shows and
   * reads `trash` for anything deleted. Writing that back as the home is how a
   * restored note forgets where it came from — which is what it did, until a
   * test said so.
   */
  home: { section: string; folder: string | null }
}

function index(stored: StoredNote[]): Indexed[] {
  const taken = new Map<string, Set<string>>()

  return [...stored]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((note) => {
      const { data, body } = parseFrontMatter(note.text)
      const title = typeof data.title === "string" ? data.title : ""

      const home = restoreLocation(data, "")
      const section = note.deleted ? TRASH : home.section
      const folder = note.deleted ? null : home.folder

      // Unique within the folder it lands in, the way a filesystem would make
      // it: two notes cannot share a name in one directory.
      const where = `${section}/${folder ?? ""}`
      const used = taken.get(where) ?? new Set<string>()
      const slug = uniqueSlug(slugify(title) || "untitled", used)
      used.add(slug)
      taken.set(where, used)

      const manualTags = normalizeManualTags(data.tags)
      const { createdAt, updatedAt } = times(note)

      return {
        note,
        body,
        home: { section: home.section, folder: home.folder },
        summary: {
          id: toNoteId({ section, folder, filename: `${slug}.md` }),
          uid: note.id,
          title,
          section,
          folder,
          tags: allTags(manualTags, body),
          manualTags,
          favorite: data.favorite === "true",
          updatedAt,
          createdAt,
          deletedAt: note.deleted ? updatedAt : null
        }
      }
    })
}

/**
 * The front matter the desktop writes, and only those keys.
 *
 * Only those because the desktop rebuilds front matter from the keys it knows
 * when it saves — so anything else the web added would be dropped the next
 * time that note was touched there, which is a worse way to find out than not
 * writing it.
 *
 * `home` rather than the summary's section, which reads `trash` for a deleted
 * note and is not where it lives.
 */
function frontMatter(one: {
  title: string
  home: { section: string; folder: string | null }
  favorite: boolean
  manualTags: string[]
  uid: string
}): Record<string, FrontMatterValue> {
  const data: Record<string, FrontMatterValue> = {
    title: one.title,
    section: one.home.section
  }
  if (one.home.folder !== null) data.folder = one.home.folder
  // Written only when set, so an ordinary note's front matter stays quiet.
  if (one.favorite) data.favorite = "true"
  if (one.manualTags.length > 0) data.tags = one.manualTags
  data.uid = one.uid
  return data
}

export function webNotes(store: NoteStore): NoteApi {
  const all = async () => index(await store.all())

  const find = async (id: string) => {
    const found = (await all()).find((one) => one.summary.id === id)
    if (found === undefined) throw new Error(`There is no note at ${id}`)
    return found
  }

  /** Writes a note and returns it as the renderer will see it next. */
  const put = async (
    uid: string,
    data: Record<string, FrontMatterValue>,
    body: string,
    deleted: boolean,
    createdAt: number
  ): Promise<NoteSummary> => {
    const note: WebNote = {
      id: uid,
      text: serializeFrontMatter(data, body),
      deleted,
      createdAt,
      updatedAt: Date.now()
    }
    await store.write(note)

    const again = (await all()).find((one) => one.note.id === uid)
    if (again === undefined) throw new Error("That note did not come back")
    return again.summary
  }

  return {
    async list() {
      return sortNotes((await all()).map((one) => one.summary))
    },

    async read(id: string): Promise<Note> {
      const { summary, body } = await find(id)
      return { ...summary, body }
    },

    async write(id: string, title: string, body: string) {
      const { note, summary, home } = await find(id)
      const data = frontMatter({ ...summary, home, title, uid: note.id })
      return put(note.id, data, body, note.deleted, summary.createdAt)
    },

    async rename(id: string, title: string) {
      const { note, summary, body, home } = await find(id)
      return put(
        note.id,
        frontMatter({ ...summary, home, title, uid: note.id }),
        body,
        note.deleted,
        summary.createdAt
      )
    },

    async create(input: CreateNoteInput): Promise<Note> {
      const uid = crypto.randomUUID()
      const body = input.body ?? ""
      const summary = await put(
        uid,
        frontMatter({
          title: input.title ?? "",
          home: { section: input.section, folder: input.folder ?? null },
          favorite: false,
          manualTags: [],
          uid
        }),
        body,
        false,
        Date.now()
      )
      return { ...summary, body }
    },

    async setFavorite(id: string, favorite: boolean) {
      const { note, summary, body, home } = await find(id)
      return put(
        note.id,
        frontMatter({ ...summary, home, favorite, uid: note.id }),
        body,
        note.deleted,
        summary.createdAt
      )
    },

    async setTags(id: string, tags: string[]) {
      const { note, summary, body, home } = await find(id)
      return put(
        note.id,
        frontMatter({ ...summary, home, manualTags: normalizeManualTags(tags), uid: note.id }),
        body,
        note.deleted,
        summary.createdAt
      )
    },

    async remove(id: string) {
      const { note, summary, body, home } = await find(id)
      return put(
        note.id,
        frontMatter({ ...summary, home, uid: note.id }),
        body,
        true,
        summary.createdAt
      )
    },

    async restore(id: string) {
      const { note, summary, body, home } = await find(id)
      return put(
        note.id,
        frontMatter({ ...summary, home, uid: note.id }),
        body,
        false,
        summary.createdAt
      )
    },

    async listFolders() {
      const folders = (await all())
        .map((one) => one.summary.folder)
        .filter((folder): folder is string => folder !== null)
      return [...new Set(folders)].sort()
    },

    /*
     * A tombstone, not a delete. The row still has to travel or the other
     * device pushes the note straight back — `docs/SYNC.md`, and the reason
     * `remove` and this one do the same thing here.
     */
    permanentDelete: notYet("notes.permanentDelete"),

    today: notYet("notes.today"),
    search: notYet("notes.search"),
    createFolder: notYet("notes.createFolder"),
    renameFolder: notYet("notes.renameFolder"),
    deleteFolder: notYet("notes.deleteFolder"),
    move: notYet("notes.move"),
    createSection: notYet("notes.createSection"),
    deleteSection: notYet("notes.deleteSection"),
    exportMarkdown: notYet("notes.exportMarkdown"),
    exportPdf: unavailable("notes.exportPdf")
  }
}

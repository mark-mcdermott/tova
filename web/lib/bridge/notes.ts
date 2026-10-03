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
import { formatDailyTitle, parseDailyTitle, toDailyNoteName } from "../../../src/shared/date"
import { slugify, uniqueSlug } from "../../../src/shared/noteName"
import { matchNote } from "../../../src/shared/search"
import {
  isValidFolderName,
  restoreLocation,
  sortNotes,
  toNoteId
} from "../../../src/shared/noteLocation"
import { allTags, normalizeManualTags } from "../../../src/shared/tags"
import type { NoteStore, StoredNote } from "../../../src/shared/noteStore"
import type {
  CreateNoteInput,
  MoveNoteInput,
  Note,
  NoteApi,
  NoteSummary,
  SearchHit
} from "../../../src/shared/types"
import { unavailable } from "./refuse"

/** What this device keeps about a note beyond what the sync carries. */
export interface WebNote extends StoredNote {
  createdAt: number
  updatedAt: number
}

const TRASH = "trash"
const DAILY = "daily"

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

      /*
       * A daily note is named by its date. That is what makes it *that day's*
       * note rather than a note that happens to be in Daily, and the desktop
       * gets it from the filename — which the web does not have, so the title
       * is read back instead.
       */
      const day = section === DAILY ? parseDailyTitle(title) : null

      // Unique within the folder it lands in, the way a filesystem would make
      // it: two notes cannot share a name in one directory.
      const where = `${section}/${folder ?? ""}`
      const used = taken.get(where) ?? new Set<string>()
      const slug =
        day === null ? uniqueSlug(slugify(title) || "untitled", used) : toDailyNoteName(day)
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

/**
 * Folders somebody made that hold nothing yet.
 *
 * A folder on the web is derived from the notes in it, so an empty one has
 * nowhere to exist. The desktop makes a directory; this remembers a name until
 * a note lands in it, and then the note carries it.
 *
 * Local to this device, deliberately. An empty folder is not writing, and a
 * name travelling to another device ahead of anything to put in it would be a
 * sidebar entry nobody there had asked for.
 */
export interface EmptyFolders {
  read: () => Promise<string[]>
  write: (folders: string[]) => Promise<void>
}

export function webNotes(
  store: NoteStore,
  empties: EmptyFolders = nowhere(),
  /** Told after every write, so a sync knows there is something to push. */
  wrote: () => void = () => {}
): NoteApi {
  const all = async () => index(await store.all())

  /** Keeps the remembered list honest when a folder is renamed or removed. */
  const remember = async (from: string, to: string | null) => {
    const held = await empties.read()
    const next = held.filter((name) => name !== from)
    if (to !== null && !next.includes(to)) next.push(to)
    await empties.write(next)
  }

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
    wrote()

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
      const inUse = (await all())
        .map((one) => one.summary.folder)
        .filter((folder): folder is string => folder !== null)
      return [...new Set([...inUse, ...(await empties.read())])].sort()
    },

    async createFolder(name: string) {
      const folder = name.trim()
      if (!isValidFolderName(folder)) throw new Error(`${name} is not a folder name`)

      await remember(folder, folder)
      return folder
    },

    /**
     * Today's note, found or made.
     *
     * Found by the path a daily note takes, which is its date — so this works
     * out to the same note the desktop would find, for the same day.
     */
    async today(): Promise<Note> {
      const date = new Date()
      const id = toNoteId({
        section: DAILY,
        folder: null,
        filename: `${toDailyNoteName(date)}.md`
      })

      const existing = (await all()).find((one) => one.summary.id === id)
      if (existing !== undefined) return { ...existing.summary, body: existing.body }

      return this.create({ section: DAILY, title: formatDailyTitle(date) })
    },

    async search(query: string): Promise<SearchHit[]> {
      const hits: SearchHit[] = []
      for (const { summary, body } of await all()) {
        // The Trash is not somewhere to find things. The desktop's search
        // skips it for the same reason, and a hit there would send somebody to
        // a note they had already thrown away.
        if (summary.section === TRASH) continue

        const match = matchNote({ title: summary.title, tags: summary.tags, body }, query)
        if (match !== null) hits.push({ note: summary, match })
      }
      return hits.sort((a, b) => b.match.score - a.match.score)
    },

    async move(id: string, input: MoveNoteInput) {
      const { note, summary, body } = await find(id)
      return put(
        note.id,
        frontMatter({
          ...summary,
          home: { section: input.section, folder: input.folder ?? null },
          uid: note.id
        }),
        body,
        false,
        summary.createdAt
      )
    },

    /**
     * Permanently, which here means emptying rather than removing.
     *
     * The row has to stay or the deletion stops travelling: a note simply
     * absent from a pull is indistinguishable from one that never existed, and
     * the other device would push it straight back. So the writing goes and the
     * tombstone remains — which is the part that actually matters, since the
     * writing is the thing somebody asked to be rid of.
     */
    async permanentDelete(id: string) {
      const { note } = await find(id)
      await store.write({ id: note.id, text: "", deleted: true })
    },

    async renameFolder(from: string, to: string) {
      const folder = to.trim()
      if (!isValidFolderName(folder)) throw new Error(`${to} is not a folder name`)

      for (const { note, summary, body, home } of await all()) {
        if (home.folder !== from || note.deleted) continue
        await put(
          note.id,
          frontMatter({ ...summary, home: { ...home, folder }, uid: note.id }),
          body,
          false,
          summary.createdAt
        )
      }

      await remember(from, folder)
      return folder
    },

    /** Its notes go to the Trash, and their new ids come back. */
    async deleteFolder(name: string) {
      const moved: string[] = []
      for (const { note, summary, body, home } of await all()) {
        if (home.folder !== name || note.deleted) continue
        moved.push(
          (
            await put(
              note.id,
              frontMatter({ ...summary, home, uid: note.id }),
              body,
              true,
              summary.createdAt
            )
          ).id
        )
      }

      await remember(name, null)
      return moved
    },

    /** Its notes go to the Trash, and their new ids come back. */
    async deleteSection(id: string) {
      const moved: string[] = []
      for (const { note, summary, body, home } of await all()) {
        if (home.section !== id || note.deleted) continue
        moved.push(
          (
            await put(
              note.id,
              frontMatter({ ...summary, home, uid: note.id }),
              body,
              true,
              summary.createdAt
            )
          ).id
        )
      }
      return moved
    },

    /*
     * A section is a directory on the desktop and nothing at all here — a note
     * is in one because its front matter says so. There is no folder to make,
     * so this succeeds by having nothing to do rather than by refusing.
     */
    createSection: () => Promise.resolve(),

    /**
     * Hands the reader the file. Resolves to its name, not its path.
     *
     * The desktop writes to disk and can say where it went. A browser hands the
     * file to whatever is handling downloads and never learns where that is, so
     * the name is the most honest thing this can return.
     */
    async exportMarkdown(id: string) {
      const { summary, body } = await find(id)
      const filename = id.split("/").pop() ?? "note.md"

      const file = new Blob(
        [
          serializeFrontMatter(
            frontMatter({
              ...summary,
              home: { section: summary.section, folder: summary.folder },
              uid: summary.uid ?? ""
            }),
            body
          )
        ],
        {
          type: "text/markdown"
        }
      )
      const url = URL.createObjectURL(file)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      return filename
    },

    exportPdf: unavailable("notes.exportPdf")
  }
}

/** No memory at all, for a caller that has not given it one. */
function nowhere(): EmptyFolders {
  let held: string[] = []
  return {
    read: async () => held,
    write: async (folders) => void (held = folders)
  }
}

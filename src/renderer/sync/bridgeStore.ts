/**
 * A `NoteStore` over `window.tova.notes`, for a backend that already has one.
 *
 * The web keeps notes in IndexedDB and builds its notes API on top. The
 * desktop is the other way round: the notes API is already there, backed by
 * markdown files in a folder somebody else can open, and what is missing is
 * the flat uid-keyed view a sync wants. This is that view.
 *
 * A note's text is rebuilt from what the API gives back rather than read off
 * disk, and that is faithful rather than approximate: the desktop rebuilds
 * front matter from the same keys when it saves, so what this produces is what
 * the file would say after its next write.
 */

import {
  parseFrontMatter as parse,
  serializeFrontMatter,
  type FrontMatterValue
} from "../../shared/frontMatter"
import type { AgreedNote, NoteStore, StoredNote } from "../../shared/noteStore"
import type { Note, NoteSummary, TovaBridge } from "../../shared/types"

/** What the backend keeps between runs, as `syncCycle` wants it back. */
interface Kept {
  cursor: string
  agreed: Record<string, { version: string; text: string; deleted: boolean }>
}

const empty: Kept = { cursor: "0", agreed: {} }

/** JSON has no bigint, so a version is stored as a string and read back. */
function asKept(value: unknown): Kept {
  if (typeof value !== "object" || value === null) return empty

  const { cursor, agreed } = value as Partial<Kept>
  return {
    cursor: typeof cursor === "string" ? cursor : "0",
    agreed: typeof agreed === "object" && agreed !== null ? agreed : {}
  }
}

/** The front matter the desktop writes, and only those keys. */
function frontMatter(note: NoteSummary): Record<string, FrontMatterValue> {
  const data: Record<string, FrontMatterValue> = { title: note.title, section: note.section }
  if (note.folder !== null) data.folder = note.folder
  if (note.favorite) data.favorite = "true"
  if (note.manualTags.length > 0) data.tags = note.manualTags
  if (note.uid !== undefined) data.uid = note.uid
  return data
}

const textOf = (note: Note) => serializeFrontMatter(frontMatter(note), note.body)

export function bridgeNoteStore(tova: TovaBridge): NoteStore {
  const keep = async (change: (kept: Kept) => Kept): Promise<void> => {
    await tova.sync.setState(change(asKept(await tova.sync.state())))
  }

  return {
    async all() {
      const summaries = await tova.notes.list()
      const notes: StoredNote[] = []

      for (const summary of summaries) {
        /*
         * A note written before uids existed has none. `docs/SYNC.md` settles
         * what to do: mint at first sync rather than sweeping, because a sweep
         * rewrites the files of everybody who never turns sync on, for their
         * trouble. Writing it back is what mints it.
         */
        const uid =
          summary.uid ??
          (
            await tova.notes.write(
              summary.id,
              summary.title,
              (await tova.notes.read(summary.id)).body
            )
          ).uid

        if (uid === undefined) continue

        const note = await tova.notes.read(summary.id)
        notes.push({ id: uid, text: textOf(note), deleted: note.section === "trash" })
      }

      return notes
    },

    async write(note) {
      const existing = (await tova.notes.list()).find((one) => one.uid === note.id)

      if (existing === undefined) {
        // New here. The front matter says where it belongs; `create` reads the
        // same keys this store writes, so a note lands where it lived.
        const { data, body } = parse(note.text)
        await tova.notes.create({
          section: typeof data.section === "string" ? data.section : "notes",
          folder: typeof data.folder === "string" ? data.folder : null,
          title: typeof data.title === "string" ? data.title : "",
          body
        })
        return
      }

      const { data, body } = parse(note.text)
      const title = typeof data.title === "string" ? data.title : existing.title
      await tova.notes.write(existing.id, title, body)

      /*
       * The tombstone after the content, so a note that arrives deleted is
       * written and then thrown away rather than written into the Trash and
       * left looking like somebody put it there.
       */
      if (note.deleted && existing.section !== "trash") await tova.notes.remove(existing.id)
      if (!note.deleted && existing.section === "trash") await tova.notes.restore(existing.id)
    },

    async agreed() {
      const kept = asKept(await tova.sync.state())
      return Object.fromEntries(
        Object.entries(kept.agreed).map(([id, one]) => [
          id,
          {
            version: BigInt(one.version),
            text: one.text,
            deleted: one.deleted
          } satisfies AgreedNote
        ])
      )
    },

    async agree(id, note) {
      await keep((kept) => ({
        ...kept,
        agreed: {
          ...kept.agreed,
          [id]: { version: String(note.version), text: note.text, deleted: note.deleted }
        }
      }))
    },

    async cursor() {
      return BigInt(asKept(await tova.sync.state()).cursor)
    },

    async setCursor(at) {
      await keep((kept) => ({ ...kept, cursor: String(at) }))
    }
  }
}

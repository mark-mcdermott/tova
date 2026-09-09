import { readFile, stat } from "fs/promises"
import { listNotes } from "./notes"
import { notePath, requireLocation } from "./vault"
import { parseFrontMatter } from "../shared/frontMatter"
import { matchNote } from "../shared/search"
import { SearchHit } from "../shared/types"

/**
 * Bodies live on disk and the renderer never holds them, so searching them
 * happens here.
 *
 * Keyed by modification time rather than invalidated by hand: every write path
 * would otherwise have to remember to tell the index, and the one that forgot
 * would return stale results silently. A stat is cheap next to a read, so a
 * keystroke re-reads only what actually changed.
 */
const bodies = new Map<string, { mtimeMs: number; body: string }>()

async function bodyOf(id: string): Promise<string> {
  const path = notePath(requireLocation(id))
  const { mtimeMs } = await stat(path)

  const cached = bodies.get(id)
  if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.body

  const { body } = parseFrontMatter(await readFile(path, "utf-8"))
  bodies.set(id, { mtimeMs, body })
  return body
}

/**
 * Notes matching the query, best answer first. Ranking is by score; ties fall
 * back to the recency `listNotes` already ordered by, so a tie is never
 * arbitrary.
 */
export async function searchNotes(query: string, limit = 50): Promise<SearchHit[]> {
  if (query.trim() === "") return []

  const notes = await listNotes()
  const hits: SearchHit[] = []

  for (const note of notes) {
    // Trash is a holding pen, not a place to find things.
    if (note.section === "trash") continue

    const body = await bodyOf(note.id).catch(() => "")
    const match = matchNote({ title: note.title, tags: note.tags, body }, query)
    if (match !== null) hits.push({ note, match })
  }

  // A note that no longer exists should not sit in the cache for the session.
  const live = new Set(notes.map((note) => note.id))
  for (const id of bodies.keys()) if (!live.has(id)) bodies.delete(id)

  return hits
    .sort((a, b) => b.match.score - a.match.score || b.note.updatedAt - a.note.updatedAt)
    .slice(0, limit)
}

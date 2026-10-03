/**
 * A note store with nothing in it but a Map.
 *
 * Here rather than in one of the test files because two of them want it, and
 * because the real one is IndexedDB — which jsdom does not have, so every test
 * of anything above the store needs this or needs a browser.
 *
 * `src/renderer/testing/` is the same idea for the renderer.
 */

import type { AgreedNote, NoteStore, StoredNote } from "../../src/shared/noteStore"

export interface Remembering extends NoteStore {
  held: Map<string, StoredNote>
}

export function inMemoryNotes(notes: StoredNote[] = []): Remembering {
  const held = new Map(notes.map((note) => [note.id, note]))
  const known: Record<string, AgreedNote> = {}
  let cursor = 0n

  return {
    held,
    all: async () => [...held.values()],
    write: async (note) => void held.set(note.id, note),
    agreed: async () => ({ ...known }),
    agree: async (id, note) => void (known[id] = note),
    cursor: async () => cursor,
    setCursor: async (to) => void (cursor = to)
  }
}

export interface HistoryEntry {
  noteId: string
  /** Editor scroll offset when the entry was last left. */
  scrollTop: number
}

export interface History {
  entries: HistoryEntry[]
  /** Points at the current entry; -1 when the history is empty. */
  index: number
}

export const emptyHistory: History = { entries: [], index: -1 }

export function current(history: History): HistoryEntry | null {
  return history.entries[history.index] ?? null
}

export function canGoBack(history: History): boolean {
  return history.index > 0
}

export function canGoForward(history: History): boolean {
  return history.index < history.entries.length - 1
}

/**
 * Adds an entry the way a browser does: anything ahead of the current position
 * is discarded, and re-opening the note already showing is a no-op rather than
 * a duplicate entry.
 */
export function push(history: History, noteId: string): History {
  const here = current(history)
  if (here !== null && here.noteId === noteId) return history

  const entries = [...history.entries.slice(0, history.index + 1), { noteId, scrollTop: 0 }]
  return { entries, index: entries.length - 1 }
}

export function goBack(history: History): History {
  return canGoBack(history) ? { ...history, index: history.index - 1 } : history
}

export function goForward(history: History): History {
  return canGoForward(history) ? { ...history, index: history.index + 1 } : history
}

/** Records where the current entry was scrolled to, before navigating away. */
export function rememberScroll(history: History, scrollTop: number): History {
  if (current(history) === null) return history

  const entries = history.entries.map((entry, position) =>
    position === history.index ? { ...entry, scrollTop } : entry
  )
  return { ...history, entries }
}

/**
 * Drops every entry for a note that no longer exists, keeping the position on
 * the nearest surviving entry so back and forward stay meaningful.
 */
export function forget(history: History, noteId: string): History {
  const removedBefore = history.entries.filter(
    (entry, position) => entry.noteId === noteId && position <= history.index
  ).length

  const entries = history.entries.filter((entry) => entry.noteId !== noteId)
  const index = Math.min(history.index - removedBefore, entries.length - 1)

  return { entries, index: Math.max(index, entries.length === 0 ? -1 : 0) }
}

/** Renames in place — a save can change a note's id without moving history. */
export function rename(history: History, from: string, to: string): History {
  if (from === to) return history

  return {
    ...history,
    entries: history.entries.map((entry) =>
      entry.noteId === from ? { ...entry, noteId: to } : entry
    )
  }
}

import { Screen } from "../../shared/screen"

/**
 * A place the reader has been. Notes were the only kind for a long while, so
 * back meant "the note before this one" and an index page passed through
 * without a trace — clicking Ideas, then a note in it, then back, skipped the
 * listing entirely.
 */
export type { Screen }

export interface HistoryEntry {
  screen: Screen
  /** Editor scroll offset when the entry was last left. */
  scrollTop: number
}

export interface History {
  entries: HistoryEntry[]
  /** Points at the current entry; -1 when the history is empty. */
  index: number
}

export const emptyHistory: History = { entries: [], index: -1 }

/**
 * Identity, for deciding whether a navigation is a move at all.
 *
 * Deliberately not `indexKey`, which collapses every search to one key so the
 * sidebar can mark where you are: two different searches are two places, and
 * back has to return to the earlier one.
 */
export function screenKey(screen: Screen): string {
  if (screen.kind === "note") return `note:${screen.noteId}`
  if (screen.kind === "home") return "home"

  const target = screen.target
  switch (target.kind) {
    case "section":
      return `section:${target.section}`
    case "folder":
      return `folder:${target.folder}`
    case "blog":
      return `blog:${target.blog}`
    case "tag":
      return `tag:${target.tag}`
    case "tags":
      return "tags"
    case "search":
      return `search:${target.query}`
  }
}

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
 * is discarded, and re-opening the screen already showing is a no-op rather
 * than a duplicate entry.
 */
export function push(history: History, screen: Screen): History {
  const here = current(history)
  if (here !== null && screenKey(here.screen) === screenKey(screen)) return history

  const entries = [...history.entries.slice(0, history.index + 1), { screen, scrollTop: 0 }]
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

const isNote = (entry: HistoryEntry, noteId: string) =>
  entry.screen.kind === "note" && entry.screen.noteId === noteId

/**
 * Drops every entry for a note that no longer exists, keeping the position on
 * the nearest surviving entry so back and forward stay meaningful. Index
 * entries are untouched: a listing outlives the notes in it.
 */
export function forget(history: History, noteId: string): History {
  const removedBefore = history.entries.filter(
    (entry, position) => isNote(entry, noteId) && position <= history.index
  ).length

  const entries = history.entries.filter((entry) => !isNote(entry, noteId))
  const index = Math.min(history.index - removedBefore, entries.length - 1)

  return { entries, index: Math.max(index, entries.length === 0 ? -1 : 0) }
}

/** Renames in place — a save can change a note's id without moving history. */
export function rename(history: History, from: string, to: string): History {
  if (from === to) return history

  return {
    ...history,
    entries: history.entries.map((entry) =>
      isNote(entry, from) ? { ...entry, screen: { kind: "note", noteId: to } } : entry
    )
  }
}

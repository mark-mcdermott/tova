import { create } from "zustand"
import { Note, NoteSummary, Section, VaultStatus } from "../../shared/types"
import { sortNotes } from "../../shared/noteLocation"
import { flushPendingSave } from "./pendingSave"
import {
  History,
  emptyHistory,
  current as currentEntry,
  push as pushHistory,
  goBack,
  goForward,
  rememberScroll as recordScroll,
  forget as forgetHistory,
  rename as renameHistory
} from "./history"

export type View = "editor" | "settings"

export const SETTINGS_TABS = ["profile", "appearance", "vault", "blogs", "general", "docs"] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface NotesState {
  notes: NoteSummary[]
  folders: string[]
  activeId: string | null
  active: Note | null
  /**
   * Bumped only when a different note is deliberately opened — never by a save.
   * The editor reloads its document off this, so renaming mid-typing (which
   * changes activeId) does not yank the cursor back to the top.
   */
  openSeq: number
  loading: boolean
  error: string | null
  vaultStatus: VaultStatus | null

  history: History
  focusTitleSeq: number
  creatingFolder: boolean
  /** Note currently being dragged, so drop targets can judge whether to accept. */
  draggingNoteId: string | null
  sidebarCollapsed: boolean
  /** Which sidebar sections and folders are open, keyed by section id. */
  expanded: Record<string, boolean>
  /** What the workspace column shows. Opening any note returns it to the editor. */
  view: View
  /** Which settings tab is showing. */
  settingsTab: SettingsTab

  load: () => Promise<void>
  openToday: () => Promise<void>
  back: () => Promise<void>
  forward: () => Promise<void>
  rememberScroll: (scrollTop: number) => void
  toggleSidebar: () => void
  showSettings: (tab?: SettingsTab) => void
  toggleSection: (key: string) => void
  expandSection: (key: string) => void
  checkVault: () => Promise<void>
  restoreFromBackup: (name: string) => Promise<void>
  open: (id: string) => Promise<void>
  save: (title: string, body: string) => Promise<void>
  createNote: (section: Section, folder: string | null) => Promise<void>
  createFolder: (name: string) => Promise<void>
  renameFolder: (from: string, to: string) => Promise<void>
  deleteFolder: (name: string) => Promise<void>
  moveNote: (id: string, section: Section, folder: string | null) => Promise<void>
  exportNote: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  requestTitleFocus: () => void
  setCreatingFolder: (value: boolean) => void
  setDraggingNote: (id: string | null) => void
  trash: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  destroy: (id: string) => Promise<void>
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  folders: [],
  activeId: null,
  active: null,
  openSeq: 0,
  loading: true,
  error: null,
  vaultStatus: null,

  history: emptyHistory,
  /** Bumped to ask the editor to focus its title input — how Rename works. */
  focusTitleSeq: 0,
  creatingFolder: false,
  draggingNoteId: null,
  sidebarCollapsed: false,
  view: "editor",
  settingsTab: "profile",
  // Everything but Tags starts collapsed, as the mockup shows it. Nothing is
  // persisted, so this is the state on every launch.
  expanded: { tags: true },

  load: async () => {
    try {
      const [notes, folders] = await Promise.all([
        window.tova.notes.list(),
        window.tova.notes.listFolders()
      ])
      set({ notes, folders, loading: false, error: null })

      // Tova always opens on today's daily note, with no prompt.
      if (get().activeId === null) await get().openToday()
    } catch (error) {
      set({ loading: false, error: describe(error) })
    }
  },

  openToday: async () => {
    try {
      const note = await window.tova.notes.today()
      set((state) => ({
        view: "editor",
        settingsTab: "profile",
        activeId: note.id,
        active: note,
        openSeq: state.openSeq + 1,
        history: pushHistory(state.history, note.id),
        notes: sortNotes([...state.notes.filter((entry) => entry.id !== note.id), toSummary(note)]),
        error: null
      }))
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  back: async () => {
    await travel(set, get, goBack)
  },

  forward: async () => {
    await travel(set, get, goForward)
  },

  rememberScroll: (scrollTop) => {
    set((state) => ({ history: recordScroll(state.history, scrollTop) }))
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
  },

  showSettings: (tab = "profile") => {
    set({ view: "settings", settingsTab: tab })
  },

  toggleSection: (key) => {
    set((state) => ({ expanded: { ...state.expanded, [key]: !state.expanded[key] } }))
  },

  expandSection: (key) => {
    set((state) => ({ expanded: { ...state.expanded, [key]: true } }))
  },

  checkVault: async () => {
    try {
      set({ vaultStatus: await window.tova.backups.status() })
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  restoreFromBackup: async (name) => {
    try {
      await window.tova.backups.restore(name)
      set({ vaultStatus: null, activeId: null, active: null })
      await get().load()
      await get().checkVault()
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  open: async (id) => {
    try {
      const note = await window.tova.notes.read(id)
      set((state) => ({
        view: "editor",
        settingsTab: "profile",
        activeId: note.id,
        active: note,
        openSeq: state.openSeq + 1,
        history: pushHistory(state.history, note.id),
        error: null
      }))
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  /**
   * Writing can rename the file, so the returned summary carries the new id and
   * the store swaps it in rather than re-listing the whole vault on every save.
   */
  save: async (title, body) => {
    const id = get().activeId
    if (id === null) return

    const summary = await window.tova.notes.write(id, title, body)
    set((state) => ({
      activeId: summary.id,
      active: state.active === null ? null : { ...summary, body },
      notes: sortNotes([...state.notes.filter((note) => note.id !== id), summary]),
      history: renameHistory(state.history, id, summary.id),
      error: null
    }))
  },

  createNote: async (section, folder) => {
    try {
      const note = await window.tova.notes.create({ section, folder, title: "" })
      set((state) => ({
        view: "editor",
        settingsTab: "profile",
        activeId: note.id,
        active: note,
        openSeq: state.openSeq + 1,
        history: pushHistory(state.history, note.id),
        notes: sortNotes([...state.notes, toSummary(note)]),
        error: null
      }))
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  createFolder: async (name) => {
    try {
      await window.tova.notes.createFolder(name)
      set({ folders: await window.tova.notes.listFolders(), error: null })
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  renameFolder: async (from, to) => {
    try {
      await window.tova.notes.renameFolder(from, to)
      await get().load()
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  deleteFolder: async (name) => {
    try {
      await window.tova.notes.deleteFolder(name)
      await get().load()
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  moveNote: async (id, section, folder) => {
    try {
      await flushPendingSave()
      const summary = await window.tova.notes.move(id, { section, folder })
      replaceNote(set, get, id, summary)
      set((state) => ({ history: renameHistory(state.history, id, summary.id) }))
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  toggleFavorite: async (id) => {
    const note = get().notes.find((candidate) => candidate.id === id)
    try {
      const summary = await window.tova.notes.setFavorite(id, !(note?.favorite ?? false))
      replaceNote(set, get, id, summary)
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  exportNote: async (id) => {
    try {
      await window.tova.notes.exportMarkdown(id)
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  // Rename has no sidebar widget by design; it focuses the note's title input.
  requestTitleFocus: () => {
    set((state) => ({ focusTitleSeq: state.focusTitleSeq + 1 }))
  },

  setDraggingNote: (id) => {
    set({ draggingNoteId: id })
  },

  setCreatingFolder: (value) => {
    // Creating a folder is only visible with Notes open.
    set((state) => ({
      creatingFolder: value,
      expanded: value ? { ...state.expanded, folders: true, notes: true } : state.expanded
    }))
  },

  trash: async (id) => {
    try {
      await flushPendingSave()
      const summary = await window.tova.notes.remove(id)
      replaceNote(set, get, id, summary)
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  restore: async (id) => {
    try {
      const summary = await window.tova.notes.restore(id)
      replaceNote(set, get, id, summary)
    } catch (error) {
      set({ error: describe(error) })
    }
  },

  destroy: async (id) => {
    try {
      await window.tova.notes.permanentDelete(id)
      set((state) => ({
        notes: state.notes.filter((note) => note.id !== id),
        activeId: state.activeId === id ? null : state.activeId,
        active: state.activeId === id ? null : state.active,
        history: forgetHistory(state.history, id),
        error: null
      }))
    } catch (error) {
      set({ error: describe(error) })
    }
  }
}))

/**
 * Moves through history and loads whatever lands under the cursor, without
 * pushing a new entry — otherwise going back would itself be a navigation.
 */
async function travel(
  set: (partial: Partial<NotesState>) => void,
  get: () => NotesState,
  step: (history: History) => History
): Promise<void> {
  const state = get()
  const next = step(state.history)
  const entry = currentEntry(next)

  if (entry === null || next === state.history) return

  try {
    const note = await window.tova.notes.read(entry.noteId)
    set({
      view: "editor",
      settingsTab: "profile",
      history: next,
      activeId: note.id,
      active: note,
      openSeq: state.openSeq + 1,
      error: null
    })
  } catch (error) {
    // The note is gone from disk; drop it rather than stranding the cursor.
    set({ history: forgetHistory(state.history, entry.noteId), error: describe(error) })
  }
}

function toSummary(note: Note): NoteSummary {
  const { body: _body, ...summary } = note
  return summary
}

type Setter = (partial: Partial<NotesState>) => void
type Getter = () => NotesState

/** Swaps a note that moved between sections, keeping it open if it was open. */
function replaceNote(set: Setter, get: Getter, previousId: string, summary: NoteSummary): void {
  const state = get()
  const wasActive = state.activeId === previousId

  set({
    notes: sortNotes([...state.notes.filter((note) => note.id !== previousId), summary]),
    activeId: wasActive ? summary.id : state.activeId,
    active:
      wasActive && state.active !== null ? { ...summary, body: state.active.body } : state.active,
    error: null
  })
}

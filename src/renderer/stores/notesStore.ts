import { create } from "zustand"
import { DEFAULT_EXPANDED } from "../../shared/preferences"
import { usePreferencesStore } from "./preferencesStore"
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
import { IndexSort, IndexTarget, held } from "../../shared/indexTarget"
import { SearchHit } from "../../shared/types"

export type View = "editor" | "settings" | "index" | "home"

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
  /** What the index page is listing, when the view is showing one. */
  indexTarget: IndexTarget | null
  /** How index pages order their rows. Kept across pages, as a reading habit. */
  indexSort: IndexSort
  /** How search results are ordered. Separate from indexSort, which has no
   * relevance to offer. */
  searchSort: IndexSort
  /** Results for the query the search index is showing, bodies included. */
  searchHits: SearchHit[]
  searching: boolean

  load: () => Promise<void>
  openToday: () => Promise<void>
  /** Reopens the last screen; false when there is not one to reopen. */
  resume: () => Promise<boolean>
  back: () => Promise<void>
  forward: () => Promise<void>
  rememberScroll: (scrollTop: number) => void
  toggleSidebar: () => void
  showSettings: (tab?: SettingsTab) => void
  toggleSection: (key: string) => void
  /** Applied once at launch, from what preferences remembered. */
  setExpanded: (expanded: Record<string, boolean>) => void
  showIndex: (target: IndexTarget) => void
  /** The page behind the wordmark. */
  showHome: () => void
  /** Opens a listing, or starts it where it is empty and can hold notes. */
  openListing: (target: IndexTarget) => Promise<void>
  setIndexSort: (sort: IndexSort) => void
  setSearchSort: (sort: IndexSort) => void
  runSearch: (query: string) => Promise<void>
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
  exportPdf: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  /** Replaces the front matter tags; the prose's are untouched. */
  setTags: (id: string, tags: string[]) => Promise<void>
  requestTitleFocus: () => void
  setCreatingFolder: (value: boolean) => void
  setDraggingNote: (id: string | null) => void
  trash: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  destroy: (id: string) => Promise<void>
}

/**
 * Where a note would go if one were made for this listing, or null where the
 * listing is not somewhere notes can be put.
 *
 * Trash is not: it is where notes go to stop being anywhere, and an empty one
 * is the good outcome. A tag is not: a tag describes notes rather than holding
 * them, and there is nothing to write in. A blog is not: its notes are posts,
 * which carry front matter and a publishing history, and an untitled draft
 * appearing because somebody clicked the folder is not the same favour.
 */
function placeForNewNote(target: IndexTarget): { section: Section; folder: string | null } | null {
  if (target.kind === "folder") return { section: "notes", folder: target.folder }
  if (target.kind !== "section" || target.section === "trash") return null
  return { section: target.section, folder: null }
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
  indexTarget: null,
  indexSort: "updated",
  searchSort: "relevance",
  searchHits: [],
  searching: false,
  // Everything but Tags starts collapsed, as the mockup shows it. Nothing is
  // persisted, so this is the state on every launch.
  expanded: { ...DEFAULT_EXPANDED },

  load: async () => {
    try {
      const [notes, folders] = await Promise.all([
        window.tova.notes.list(),
        window.tova.notes.listFolders()
      ])
      set({ notes, folders, loading: false, error: null })

      // Back where you were, or today's note if there is nowhere to go back to.
      if (get().activeId === null && get().indexTarget === null) {
        if (!(await get().resume())) await get().openToday()
      }
    } catch (error) {
      set({ loading: false, error: describe(error) })
    }
  },

  /**
   * Reopens the screen the app was last on. False when there is none, or when
   * what it named has since gone — a note deleted between launches should cost
   * you today's note, not an error.
   */
  resume: async () => {
    const screen = await window.tova.session.read()
    if (screen === null) return false

    if (screen.kind === "home") {
      get().showHome()
      return true
    }

    if (screen.kind === "index") {
      get().showIndex(screen.target)
      return true
    }

    try {
      const note = await window.tova.notes.read(screen.noteId)
      set((state) => ({
        view: "editor",
        activeId: note.id,
        active: note,
        openSeq: state.openSeq + 1,
        history: pushHistory(state.history, { kind: "note", noteId: note.id }),
        error: null
      }))
      return true
    } catch {
      return false
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
        history: pushHistory(state.history, { kind: "note", noteId: note.id }),
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

  showHome: () => {
    set((state) => ({
      view: "home",
      history: pushHistory(state.history, { kind: "home" })
    }))
  },

  showIndex: (target) => {
    set((state) => ({
      view: "index",
      indexTarget: target,
      history: pushHistory(state.history, { kind: "index", target })
    }))
  },

  /*
   * Opening a listing the way the rail does: by going somewhere to write.
   *
   * An empty listing is a page saying there is nothing here, shown to somebody
   * who has just asked for somewhere to put something. Where the listing is a
   * place notes can go, the first one is made and opened instead.
   *
   * Separate from `showIndex` rather than folded into it, because most of the
   * ways a listing opens are not that gesture: a breadcrumb going up a level,
   * back and forward, and the session reopening where it was left all pass
   * through `showIndex`, and none of them should add a note to the vault.
   */
  openListing: async (target) => {
    const place = placeForNewNote(target)
    if (place === null || held(get().notes, target).length > 0) {
      get().showIndex(target)
      return
    }

    // Daily's first note is today's, which has a name and a shape already.
    if (place.section === "daily") {
      await get().openToday()
      return
    }
    await get().createNote(place.section, place.folder)
  },

  setIndexSort: (sort) => {
    set({ indexSort: sort })
  },

  setSearchSort: (sort) => {
    set({ searchSort: sort })
  },

  runSearch: async (query) => {
    if (query.trim() === "") {
      set({ searchHits: [], searching: false })
      return
    }

    set({ searching: true })
    try {
      const hits = await window.tova.notes.search(query)
      // Only answer the query still on screen: a slow search for "wri" must not
      // land after the reader has typed "writing".
      const target = get().indexTarget
      if (target?.kind === "search" && target.query !== query) return
      set({ searchHits: hits, searching: false })
    } catch (error) {
      set({ error: describe(error), searching: false })
    }
  },

  /*
   * Folding is written down, so the rail a reader arranged is the rail they
   * come back to. It goes to preferences rather than the session because it is
   * a choice about the app rather than a note of where they were — the session
   * is restored, and this is remembered.
   */
  toggleSection: (key) => {
    const expanded = { ...get().expanded, [key]: !get().expanded[key] }
    set({ expanded })
    void usePreferencesStore.getState().update({ expanded })
  },

  expandSection: (key) => {
    if (get().expanded[key] === true) return

    const expanded = { ...get().expanded, [key]: true }
    set({ expanded })
    void usePreferencesStore.getState().update({ expanded })
  },

  setExpanded: (expanded) => {
    set({ expanded })
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
        history: pushHistory(state.history, { kind: "note", noteId: note.id }),
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
        history: pushHistory(state.history, { kind: "note", noteId: note.id }),
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

  setTags: async (id, tags) => {
    try {
      const summary = await window.tova.notes.setTags(id, tags)
      replaceNote(set, get, id, summary)

      // The open note carries the body, which replaceNote's summary does not,
      // so its own copy is patched rather than replaced.
      set((state) =>
        state.active?.id === id
          ? { active: { ...state.active, tags: summary.tags, manualTags: summary.manualTags } }
          : {}
      )
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

  exportPdf: async (id) => {
    try {
      await window.tova.notes.exportPdf(id)
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
      // Opening Notes to show the new folder is worth remembering like any
      // other fold, so it goes through the same door.
      expanded: value ? { ...state.expanded, notes: true } : state.expanded
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

  const screen = entry.screen

  // Home holds nothing at all, so there is nothing to read or to fail.
  if (screen.kind === "home") {
    set({ view: "home", history: next, error: null })
    return
  }

  // A listing needs nothing read: it is a filter over what is already held, so
  // it lands immediately and cannot fail the way a missing file can.
  if (screen.kind === "index") {
    set({ view: "index", indexTarget: screen.target, history: next, error: null })
    return
  }

  try {
    const note = await window.tova.notes.read(screen.noteId)
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
    set({ history: forgetHistory(state.history, screen.noteId), error: describe(error) })
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

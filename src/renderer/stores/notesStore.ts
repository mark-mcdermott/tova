import { create } from "zustand"
import { Note, NoteSummary, Section, VaultStatus } from "../../shared/types"
import { sortNotes } from "../../shared/noteLocation"

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

  load: () => Promise<void>
  checkVault: () => Promise<void>
  restoreFromBackup: (name: string) => Promise<void>
  open: (id: string) => Promise<void>
  save: (title: string, body: string) => Promise<void>
  createNote: (section: Section, folder: string | null) => Promise<void>
  createFolder: (name: string) => Promise<void>
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

  load: async () => {
    try {
      const [notes, folders] = await Promise.all([
        window.tova.notes.list(),
        window.tova.notes.listFolders()
      ])
      set({ notes, folders, loading: false, error: null })

      // Open the most recent note so the app never starts on a blank editor.
      const { activeId } = get()
      const first = notes.find((note) => note.section !== "trash")
      if (activeId === null && first !== undefined) await get().open(first.id)
    } catch (error) {
      set({ loading: false, error: describe(error) })
    }
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
        activeId: note.id,
        active: note,
        openSeq: state.openSeq + 1,
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
      error: null
    }))
  },

  createNote: async (section, folder) => {
    try {
      const note = await window.tova.notes.create({ section, folder, title: "" })
      set((state) => ({
        activeId: note.id,
        active: note,
        openSeq: state.openSeq + 1,
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

  trash: async (id) => {
    try {
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
        error: null
      }))
    } catch (error) {
      set({ error: describe(error) })
    }
  }
}))

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
    active: wasActive && state.active !== null ? { ...summary, body: state.active.body } : state.active,
    error: null
  })
}

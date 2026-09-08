import { create } from "zustand"
import { Blog, BlogSecret, BlogSummary, SyncResult } from "../../shared/types"
import { useNotesStore } from "./notesStore"

interface BlogsState {
  blogs: BlogSummary[]
  /** False when the OS offers no keychain to encrypt a token against. */
  canStoreSecrets: boolean
  loaded: boolean

  /** When each blog last synced, keyed by id; 0 for never. */
  lastSynced: Record<string, number>
  /** Blog ids with a sync running. */
  syncing: string[]
  /** The most recent sync's outcome, keyed by blog id. */
  results: Record<string, SyncResult>

  load: () => Promise<void>
  sync: (id: string) => Promise<void>
  deletePost: (blogName: string, filename: string, alsoRemote: boolean) => Promise<void>
  save: (blog: Blog, secrets: Partial<Record<BlogSecret, string>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useBlogsStore = create<BlogsState>((set, get) => ({
  blogs: [],
  canStoreSecrets: true,
  loaded: false,
  lastSynced: {},
  syncing: [],
  results: {},

  load: async () => {
    const [blogs, canStoreSecrets, lastSynced] = await Promise.all([
      window.tova.blogs.list(),
      window.tova.blogs.canStoreSecrets(),
      window.tova.blogs.lastSynced()
    ])
    set({ blogs, canStoreSecrets, lastSynced, loaded: true })
  },

  sync: async (id) => {
    set((state) => ({ syncing: [...state.syncing, id] }))
    try {
      const result = await window.tova.blogs.sync(id)
      set((state) => ({
        results: { ...state.results, [id]: result },
        lastSynced: { ...state.lastSynced, [id]: result.syncedAt }
      }))
      // Imported posts are notes, so the sidebar has to hear about them.
      await useNotesStore.getState().load()
    } finally {
      set((state) => ({ syncing: state.syncing.filter((entry) => entry !== id) }))
    }
  },

  save: async (blog, secrets) => {
    const saved = await window.tova.blogs.save(blog)

    // Secrets are set against the saved id, so a new blog can carry a token in
    // the same submit that creates it.
    for (const [name, value] of Object.entries(secrets)) {
      await window.tova.blogs.setSecret(saved.id, name as BlogSecret, value)
    }

    await get().load()
  },

  deletePost: async (blogName, filename, alsoRemote) => {
    const blog = get().blogs.find((entry) => entry.name === blogName)
    if (blog === undefined) throw new Error(`No blog named ${blogName} is configured`)

    await window.tova.blogs.deletePost(blog.id, filename, alsoRemote)
    await useNotesStore.getState().load()
  },

  remove: async (id) => {
    await window.tova.blogs.remove(id)
    await get().load()
  }
}))

import { create } from "zustand"
import { Blog, BlogSecret, BlogSummary } from "../../shared/types"

interface BlogsState {
  blogs: BlogSummary[]
  /** False when the OS offers no keychain to encrypt a token against. */
  canStoreSecrets: boolean
  loaded: boolean

  load: () => Promise<void>
  save: (blog: Blog, secrets: Partial<Record<BlogSecret, string>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useBlogsStore = create<BlogsState>((set, get) => ({
  blogs: [],
  canStoreSecrets: true,
  loaded: false,

  load: async () => {
    const [blogs, canStoreSecrets] = await Promise.all([
      window.tova.blogs.list(),
      window.tova.blogs.canStoreSecrets()
    ])
    set({ blogs, canStoreSecrets, loaded: true })
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

  remove: async (id) => {
    await window.tova.blogs.remove(id)
    await get().load()
  }
}))

import { create } from "zustand"
import { DEFAULT_PREFERENCES, Preferences } from "../../shared/preferences"

interface PreferencesState {
  preferences: Preferences
  /** Data URL of a chosen avatar, or null when the bundled one applies. */
  avatarUrl: string | null
  loaded: boolean

  load: () => Promise<void>
  update: (patch: Partial<Preferences>) => Promise<void>
  chooseAvatar: () => Promise<void>
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  avatarUrl: null,
  loaded: false,

  load: async () => {
    const [preferences, avatarUrl] = await Promise.all([
      window.tova.preferences.read(),
      window.tova.preferences.avatarUrl()
    ])
    set({ preferences, avatarUrl, loaded: true })
  },

  update: async (patch) => {
    // Written through main, which normalises — so what comes back is what is
    // on disk, not what the form hoped for.
    const saved = await window.tova.preferences.write({ ...get().preferences, ...patch })
    set({ preferences: saved })

    if (patch.spellcheck !== undefined) {
      await window.tova.spellcheck.setEnabled(saved.spellcheck)
    }
  },

  chooseAvatar: async () => {
    const chosen = await window.tova.preferences.chooseAvatar()
    if (chosen === null) return
    await get().load()
  }
}))

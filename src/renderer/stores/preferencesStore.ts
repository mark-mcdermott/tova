import { create } from "zustand"
import { DEFAULT_PREFERENCES, Preferences } from "../../shared/preferences"

interface PreferencesState {
  preferences: Preferences
  /** Data URL of a chosen avatar, or null when the bundled one applies. */
  avatarUrl: string | null
  /** Backgrounds the reader has added. */
  /** Pictures the reader added, kept per mode as the bundled ones are. */
  userBackgrounds: { light: string[]; dark: string[] }
  loaded: boolean

  load: () => Promise<void>
  update: (patch: Partial<Preferences>) => Promise<void>
  chooseAvatar: () => Promise<void>
  /** Adds a background and assigns it to the theme that asked for it. */
  addBackground: (theme: "light" | "dark") => Promise<void>
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  avatarUrl: null,
  userBackgrounds: { light: [], dark: [] },
  loaded: false,

  load: async () => {
    const [preferences, avatarUrl, light, dark] = await Promise.all([
      window.tova.preferences.read(),
      window.tova.preferences.avatarUrl(),
      window.tova.preferences.listBackgrounds("light"),
      window.tova.preferences.listBackgrounds("dark")
    ])
    const userBackgrounds = { light, dark }
    set({ preferences, avatarUrl, userBackgrounds, loaded: true })
  },

  addBackground: async (theme) => {
    const name = await window.tova.preferences.addBackground(theme)
    if (name === null) return

    // Only the row it was added to changes; the other keeps what it had.
    const names = await window.tova.preferences.listBackgrounds(theme)
    set((state) => ({ userBackgrounds: { ...state.userBackgrounds, [theme]: names } }))
    // Chosen as well as added: nobody picks a file in order to not use it.
    await get().update(theme === "dark" ? { backgroundDark: name } : { backgroundLight: name })
  },

  update: async (patch) => {
    // Written through main, which normalises — so what comes back is what is
    // on disk, not what the form hoped for.
    const saved = await window.tova.preferences.write({ ...get().preferences, ...patch })
    set({ preferences: saved })

    // The picture is read separately from the preference naming it, so changing
    // which file it is has to pull the new one. Without this, removing an
    // avatar wrote the change to disk and left the old portrait on screen until
    // some unrelated reload happened to refresh it — which read as the button
    // being slow, or broken, rather than as nothing having happened.
    if (patch.avatarFile !== undefined) {
      set({ avatarUrl: await window.tova.preferences.avatarUrl() })
    }

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

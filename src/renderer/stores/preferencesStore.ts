import { create } from "zustand"
import {
  AvatarSources,
  DEFAULT_PREFERENCES,
  NO_AVATARS,
  Preferences
} from "../../shared/preferences"

interface PreferencesState {
  preferences: Preferences
  /** The two fetched faces; which of them is drawn is a preference. */
  avatarSources: AvatarSources
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
  avatarSources: NO_AVATARS,
  userBackgrounds: { light: [], dark: [] },
  loaded: false,

  load: async () => {
    const [preferences, avatarSources, light, dark] = await Promise.all([
      window.tova.preferences.read(),
      window.tova.preferences.avatarSources(),
      window.tova.preferences.listBackgrounds("light"),
      window.tova.preferences.listBackgrounds("dark")
    ])
    const userBackgrounds = { light, dark }
    set({ preferences, avatarSources, userBackgrounds, loaded: true })
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

    // The pictures are read separately from the preference naming one, so
    // changing which file it is has to pull them again. Without this, removing
    // an avatar wrote the change to disk and left the old portrait on screen
    // until some unrelated reload happened to refresh it — which read as the
    // button being slow, or broken, rather than as nothing having happened.
    if (patch.avatarFile !== undefined) {
      set({ avatarSources: await window.tova.preferences.avatarSources() })
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

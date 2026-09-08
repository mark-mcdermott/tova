import type {
  AppApi,
  NoteApi,
  BackupApi,
  BlogApi,
  EventsApi,
  ImageApi,
  PreferencesApi,
  PublishApi,
  SpellcheckApi
} from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
      backups: BackupApi
      images: ImageApi
      blogs: BlogApi
      publish: PublishApi
      spellcheck: SpellcheckApi
      preferences: PreferencesApi
      app: AppApi
      events: EventsApi
    }
  }
}

export {}

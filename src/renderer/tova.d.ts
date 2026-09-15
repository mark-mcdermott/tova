import type {
  AppApi,
  NoteApi,
  BackupApi,
  BlogApi,
  EventsApi,
  GrammarApi,
  ImageApi,
  PreferencesApi,
  PublishApi,
  SessionApi,
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
      grammar: GrammarApi
      preferences: PreferencesApi
      session: SessionApi
      app: AppApi
      events: EventsApi
    }
  }
}

export {}

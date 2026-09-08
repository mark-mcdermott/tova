import type {
  AppApi,
  NoteApi,
  BackupApi,
  BlogApi,
  EventsApi,
  ImageApi,
  PublishApi
} from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
      backups: BackupApi
      images: ImageApi
      blogs: BlogApi
      publish: PublishApi
      app: AppApi
      events: EventsApi
    }
  }
}

export {}

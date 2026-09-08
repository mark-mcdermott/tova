import type { AppApi, NoteApi, BackupApi, BlogApi, EventsApi, ImageApi } from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
      backups: BackupApi
      images: ImageApi
      blogs: BlogApi
      app: AppApi
      events: EventsApi
    }
  }
}

export {}

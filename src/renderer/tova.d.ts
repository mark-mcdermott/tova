import type { AppApi, NoteApi, BackupApi, EventsApi, ImageApi } from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
      backups: BackupApi
      images: ImageApi
      app: AppApi
      events: EventsApi
    }
  }
}

export {}

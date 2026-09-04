import type { NoteApi, BackupApi, EventsApi } from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
      backups: BackupApi
      events: EventsApi
    }
  }
}

export {}

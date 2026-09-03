import type { NoteApi, BackupApi } from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
      backups: BackupApi
    }
  }
}

export {}

import type { NoteApi } from "../shared/types"

declare global {
  interface Window {
    tova: {
      notes: NoteApi
    }
  }
}

export {}

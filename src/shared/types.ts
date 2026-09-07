export const SECTIONS = ["notes", "daily", "ideas", "journal", "archive", "trash"] as const

export type Section = (typeof SECTIONS)[number]

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value)
}

export interface NoteSummary {
  /** Vault-relative path, e.g. `notes/ideas/river.md`. Changes when renamed. */
  id: string
  title: string
  /** Where the note lives now — `trash` for anything soft-deleted. */
  section: Section
  /** Single folder under Notes; null for loose notes and for Daily. */
  folder: string | null
  tags: string[]
  updatedAt: number
  /** Present only in Trash. */
  deletedAt: number | null
}

export interface Note extends NoteSummary {
  body: string
}

export interface CreateNoteInput {
  section: Section
  folder?: string | null
  title?: string
  body?: string
  /** Exact filename to use instead of one derived from the title. */
  filename?: string
}

export interface MoveNoteInput {
  section: Section
  folder?: string | null
}

export interface EventsApi {
  /** Subscribes to vault changes made by the main process. Returns an unsubscribe. */
  onNotesChanged: (listener: () => void) => () => void
}

export interface BackupSummary {
  name: string
  createdAt: number
  noteCount: number
}

export interface VaultStatus {
  empty: boolean
  backups: BackupSummary[]
}

export interface BackupApi {
  run: () => Promise<BackupSummary>
  list: () => Promise<BackupSummary[]>
  restore: (name: string) => Promise<BackupSummary>
  status: () => Promise<VaultStatus>
  listVersions: (noteId: string) => Promise<string[]>
  readVersion: (noteId: string, version: string) => Promise<string>
}

export interface NoteApi {
  list: () => Promise<NoteSummary[]>
  read: (id: string) => Promise<Note>
  write: (id: string, title: string, body: string) => Promise<NoteSummary>
  create: (input: CreateNoteInput) => Promise<Note>
  rename: (id: string, title: string) => Promise<NoteSummary>
  move: (id: string, input: MoveNoteInput) => Promise<NoteSummary>
  remove: (id: string) => Promise<NoteSummary>
  restore: (id: string) => Promise<NoteSummary>
  permanentDelete: (id: string) => Promise<void>
  today: () => Promise<Note>
  listFolders: () => Promise<string[]>
  createFolder: (name: string) => Promise<string>
  renameFolder: (from: string, to: string) => Promise<string>
  deleteFolder: (name: string) => Promise<string[]>
  /** Resolves to the written path, or null if the user cancelled. */
  exportMarkdown: (id: string) => Promise<string | null>
}

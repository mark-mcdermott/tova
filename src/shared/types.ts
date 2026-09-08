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
  /** Pinned to the top of its section by the user. */
  favorite: boolean
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

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  vaultPath: string
  backupPath: string
}

export interface AppApi {
  info: () => Promise<AppInfo>
  /** Opens one of the vault directories in the OS file browser. */
  reveal: (target: "vault" | "backups") => Promise<void>
}

export interface ImageApi {
  /** Writes an image into the vault. Resolves to its vault-relative path. */
  save: (name: string, data: Uint8Array) => Promise<string>
}

/** A blog's secrets never cross to the renderer; only whether it has them. */
export type BlogSecret = "github" | "cloudflare" | "vercel"

export interface BlogGithub {
  /** `owner/repo`. */
  repo: string
  branch: string
  /** Where posts live in the repo, e.g. `src/content/posts/`. */
  contentPath: string
}

export type DeployProvider = "none" | "cloudflare" | "vercel"

export interface BlogDeploy {
  provider: DeployProvider
  /** Cloudflare Pages, when that is the provider. */
  accountId: string
  projectName: string
  /** Vercel, when that is the provider. */
  projectId: string
}

export interface Blog {
  id: string
  /** Doubles as the `@handle` in `@handle post`, so it carries no whitespace. */
  name: string
  /** Overrides the name in the sidebar. Falls back to the name when empty. */
  sidebarLabel: string
  /** Base URL of the live site, used to link a published post. */
  siteUrl: string
  github: BlogGithub
  deploy: BlogDeploy
}

export interface BlogSummary extends Blog {
  hasGithubToken: boolean
  hasDeployToken: boolean
}

export interface BlogApi {
  list: () => Promise<BlogSummary[]>
  /** Creates when the id is empty, updates otherwise. Secrets are untouched. */
  save: (blog: Blog) => Promise<BlogSummary>
  remove: (id: string) => Promise<void>
  /** Write-only: an empty value clears the stored secret. */
  setSecret: (id: string, secret: BlogSecret, value: string) => Promise<BlogSummary>
  /** False when the OS has no keychain to encrypt against. */
  canStoreSecrets: () => Promise<boolean>
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
  setFavorite: (id: string, favorite: boolean) => Promise<NoteSummary>
  renameFolder: (from: string, to: string) => Promise<string>
  deleteFolder: (name: string) => Promise<string[]>
  /** Resolves to the written path, or null if the user cancelled. */
  exportMarkdown: (id: string) => Promise<string | null>
}

import type { Screen } from "./screen"

/**
 * A section is a directory in the vault, and the reader configures which ones
 * exist — see `sections.ts`. So this is the shape of an id rather than a list
 * of them: what makes it safe is that it cannot climb a path, and the vault's
 * own choke point refuses anything that tries.
 */
export type Section = string

/** Sections whose notes are filed one folder deep. Everything else is flat. */
export const FOLDERED_SECTIONS: readonly Section[] = ["notes", "posts"]

export function isSection(value: string): value is Section {
  return /^[a-z0-9][a-z0-9-]*$/.test(value)
}

export interface VaultChoice {
  path: string
  name: string
  active: boolean
}

export interface SearchHit {
  note: NoteSummary
  match: { where: "title" | "tag" | "body"; snippet: string | null; score: number }
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
  /** Filesystem birth time — what "date created" sorts on. */
  createdAt: number
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
  /** Opens an http(s) link in the OS browser. */
  openExternal: (url: string) => Promise<void>
}

export interface SessionApi {
  /** Where the reader was when the app last had their attention, or null. */
  read: () => Promise<Screen | null>
  /** Written on every move, so a crash costs no more than a tidy quit. */
  write: (screen: Screen) => Promise<void>
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
  /** Base URL of the live site, used to link a published post. */
  siteUrl: string
  /** URL path posts appear under on the live site, e.g. `/posts/`. */
  livePostPath: string
  github: BlogGithub
  deploy: BlogDeploy
}

export interface BlogSummary extends Blog {
  hasGithubToken: boolean
  hasDeployToken: boolean
}

export interface SyncResult {
  blogId: string
  imported: number
  updated: number
  unchanged: number
  /** Changed here since the last sync; the rocket sends these, not the sync. */
  awaitingPublish: string[]
  /** Changed on both sides. Left alone, both copies intact. */
  conflicts: string[]
  /** Gone from the blog but still here. Never deleted automatically. */
  removedRemotely: string[]
  syncedAt: number
}

export interface BlogApi {
  list: () => Promise<BlogSummary[]>
  /** Creates when the id is empty, updates otherwise. Secrets are untouched. */
  save: (blog: Blog) => Promise<BlogSummary>
  /** Removes the blog. Its synced posts go to Trash only if asked. */
  remove: (id: string, trashPosts: boolean) => Promise<void>
  /** How many posts that blog holds locally. */
  postCount: (id: string) => Promise<number>
  /** Write-only: an empty value clears the stored secret. */
  setSecret: (id: string, secret: BlogSecret, value: string) => Promise<BlogSummary>
  /** False when the OS has no keychain to encrypt against. */
  canStoreSecrets: () => Promise<boolean>
  /** Pulls the blog's posts down. Resolves to what it found and what it left. */
  sync: (id: string) => Promise<SyncResult>
  /** When each blog last synced, keyed by blog id; 0 for never. */
  lastSynced: () => Promise<Record<string, number>>
  /** Both sides of a conflict, for showing what the choice is between. */
  conflict: (id: string, filename: string) => Promise<{ local: string; remote: string }>
  /** Resolve a conflict: take the blog's copy, or keep the one here. */
  resolve: (id: string, filename: string, keep: "local" | "remote") => Promise<void>
  /** Trash a post locally, optionally removing it from the blog as well. */
  deletePost: (id: string, filename: string, alsoRemote: boolean) => Promise<void>
}

export interface PublishRequest {
  noteId: string
  /** The blog's name, as written in `@name post`. */
  blog: string
  /** 0-based line of the header in the note's body, so the right post is taken. */
  headerLine: number
}

export interface PublishUpdate {
  /** Identifies this attempt, so a second publish does not overwrite the first. */
  id: string
  request: PublishRequest
  phase: import("./publishProgress").PublishPhase
  progress: number
  message: string
  /** The computed filename, so the note can record what it published as. */
  filename: string
  /** Where the post went live, once the deploy reports one. */
  url: string | null
  /** Set only when the publish failed. */
  error: string | null
}

export interface PublishApi {
  start: (request: PublishRequest) => Promise<PublishUpdate>
  /** Subscribes to progress for every publish. Returns an unsubscribe. */
  onUpdate: (listener: (update: PublishUpdate) => void) => () => void
}

export interface Misspelling {
  word: string
  suggestions: string[]
  /** Where the right-click landed, in renderer coordinates. */
  x: number
  y: number
}

export interface SpellcheckApi {
  /** Fires when a right-click lands on a misspelling. Returns an unsubscribe. */
  onSuggest: (listener: (misspelling: Misspelling) => void) => () => void
  /** Replaces the word the context menu was opened on. */
  replace: (word: string) => Promise<void>
  addWord: (word: string) => Promise<string[]>
  removeWord: (word: string) => Promise<string[]>
  listWords: () => Promise<string[]>
  setEnabled: (enabled: boolean) => Promise<void>
}

export interface PreferencesApi {
  read: () => Promise<import("./preferences").Preferences>
  write: (
    preferences: import("./preferences").Preferences
  ) => Promise<import("./preferences").Preferences>
  /** Opens a picker and copies the chosen image in. Null if cancelled. */
  chooseAvatar: () => Promise<string | null>
  /** Data URL for the stored avatar, or null when the bundled one applies. */
  avatarUrl: () => Promise<string | null>
  /** Backgrounds the reader added, served over the tova-bg scheme. */
  listBackgrounds: () => Promise<string[]>
  /** Opens a picker, copies the chosen image in, and returns its stored name. */
  addBackground: () => Promise<string | null>
  /** Title faces the reader added, served over the tova-font scheme. */
  listTitleFonts: () => Promise<string[]>
  /** Opens a picker, copies the chosen font in, and returns its stored name. */
  addTitleFont: () => Promise<string | null>
  removeTitleFont: (name: string) => Promise<void>
  /** An added face as a data URL — see titleFonts.ts on why not a scheme. */
  titleFontUrl: (name: string) => Promise<string | null>
  listVaults: () => Promise<VaultChoice[]>
  /** Opens a directory picker and switches to what was chosen. */
  addVault: () => Promise<VaultChoice[]>
  useVault: (path: string) => Promise<VaultChoice[]>
  /** Stops listing a vault. The directory and its notes are left alone. */
  forgetVault: (path: string) => Promise<VaultChoice[]>
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
  /** Printed by Chromium itself; returns where it was saved, or null if cancelled. */
  exportPdf: (id: string) => Promise<string | null>
  /** Full-text search, bodies included — they only exist in main. */
  search: (query: string) => Promise<SearchHit[]>
  /** Makes a new section's directory in the vault. */
  createSection: (id: string) => Promise<void>
  /** Removes a section, moving whatever it held to Trash. Returns their new ids. */
  deleteSection: (id: string) => Promise<string[]>
}

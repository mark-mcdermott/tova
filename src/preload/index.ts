import { contextBridge, ipcRenderer } from "electron"
import type {
  AppApi,
  NoteApi,
  BackupApi,
  BlogApi,
  EventsApi,
  ImageApi,
  Misspelling,
  PublishApi,
  PreferencesApi,
  SessionApi,
  PublishUpdate,
  SpellcheckApi
} from "../shared/types"

/*
 * The only bridge between renderer and main. Each method is a thin, typed
 * wrapper over one IPC channel — no filesystem or Node APIs are exposed.
 */
const notes: NoteApi = {
  list: () => ipcRenderer.invoke("note:list"),
  read: (id) => ipcRenderer.invoke("note:read", id),
  write: (id, title, body) => ipcRenderer.invoke("note:write", id, title, body),
  create: (input) => ipcRenderer.invoke("note:create", input),
  rename: (id, title) => ipcRenderer.invoke("note:rename", id, title),
  move: (id, input) => ipcRenderer.invoke("note:move", id, input),
  remove: (id) => ipcRenderer.invoke("note:delete", id),
  restore: (id) => ipcRenderer.invoke("note:restore", id),
  permanentDelete: (id) => ipcRenderer.invoke("note:permanentDelete", id),
  today: () => ipcRenderer.invoke("note:today"),
  listFolders: () => ipcRenderer.invoke("folder:list"),
  createFolder: (name) => ipcRenderer.invoke("folder:create", name),
  renameFolder: (from, to) => ipcRenderer.invoke("folder:rename", from, to),
  deleteFolder: (name) => ipcRenderer.invoke("folder:delete", name),
  exportMarkdown: (id) => ipcRenderer.invoke("note:export", id),
  exportPdf: (id) => ipcRenderer.invoke("note:exportPdf", id),
  search: (query) => ipcRenderer.invoke("note:search", query),
  createSection: (id) => ipcRenderer.invoke("section:create", id),
  deleteSection: (id) => ipcRenderer.invoke("section:delete", id),
  setFavorite: (id, favorite) => ipcRenderer.invoke("note:favorite", id, favorite),
  setTags: (id, tags) => ipcRenderer.invoke("note:tags", id, tags)
}

const backups: BackupApi = {
  run: () => ipcRenderer.invoke("backup:run"),
  list: () => ipcRenderer.invoke("backup:list"),
  restore: (name) => ipcRenderer.invoke("backup:restore", name),
  status: () => ipcRenderer.invoke("backup:status"),
  listVersions: (noteId) => ipcRenderer.invoke("backup:listVersions", noteId),
  readVersion: (noteId, version) => ipcRenderer.invoke("backup:readVersion", noteId, version)
}

const images: ImageApi = {
  save: (name, data) => ipcRenderer.invoke("image:save", name, data)
}

const appInfo: AppApi = {
  info: () => ipcRenderer.invoke("app:info"),
  reveal: (target) => ipcRenderer.invoke("app:reveal", target),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url)
}

const blogs: BlogApi = {
  list: () => ipcRenderer.invoke("blog:list"),
  save: (blog) => ipcRenderer.invoke("blog:save", blog),
  remove: (id, trashPosts) => ipcRenderer.invoke("blog:delete", id, trashPosts),
  postCount: (id) => ipcRenderer.invoke("blog:postCount", id),
  setSecret: (id, secret, value) => ipcRenderer.invoke("blog:setSecret", id, secret, value),
  canStoreSecrets: () => ipcRenderer.invoke("blog:canStoreSecrets"),
  sync: (id) => ipcRenderer.invoke("blog:sync", id),
  lastSynced: () => ipcRenderer.invoke("blog:lastSynced"),
  conflict: (id, filename) => ipcRenderer.invoke("blog:conflict", id, filename),
  resolve: (id, filename, keep) => ipcRenderer.invoke("blog:resolve", id, filename, keep),
  deletePost: (id, filename, alsoRemote) =>
    ipcRenderer.invoke("blog:deletePost", id, filename, alsoRemote)
}

const publishing: PublishApi = {
  start: (request) => ipcRenderer.invoke("publish:start", request),
  onUpdate: (listener) => {
    const handler = (_event: unknown, update: PublishUpdate): void => listener(update)
    ipcRenderer.on("publish:update", handler)
    return () => {
      ipcRenderer.removeListener("publish:update", handler)
    }
  }
}

const spellcheck: SpellcheckApi = {
  check: (text) => ipcRenderer.invoke("spellcheck:check", text),
  onSuggest: (listener) => {
    const handler = (_event: unknown, misspelling: Misspelling): void => listener(misspelling)
    ipcRenderer.on("spellcheck:suggest", handler)
    return () => {
      ipcRenderer.removeListener("spellcheck:suggest", handler)
    }
  },
  replace: (word) => ipcRenderer.invoke("spellcheck:replace", word),
  addWord: (word) => ipcRenderer.invoke("spellcheck:addWord", word),
  removeWord: (word) => ipcRenderer.invoke("spellcheck:removeWord", word),
  listWords: () => ipcRenderer.invoke("spellcheck:listWords"),
  setEnabled: (enabled) => ipcRenderer.invoke("spellcheck:setEnabled", enabled)
}

const session: SessionApi = {
  read: () => ipcRenderer.invoke("session:read"),
  write: (screen) => ipcRenderer.invoke("session:write", screen)
}

const preferences: PreferencesApi = {
  read: () => ipcRenderer.invoke("prefs:read"),
  write: (value) => ipcRenderer.invoke("prefs:write", value),
  chooseAvatar: () => ipcRenderer.invoke("prefs:chooseAvatar"),
  avatarSources: () => ipcRenderer.invoke("prefs:avatarSources"),
  accountName: () => ipcRenderer.invoke("prefs:accountName"),
  reset: () => ipcRenderer.invoke("settings:reset"),
  nukeTargets: () => ipcRenderer.invoke("settings:nukeTargets"),
  nuke: () => ipcRenderer.invoke("settings:nuke"),
  listBackgrounds: (theme) => ipcRenderer.invoke("background:list", theme),
  addBackground: (theme) => ipcRenderer.invoke("background:add", theme),
  listTitleFonts: () => ipcRenderer.invoke("font:list"),
  addTitleFont: () => ipcRenderer.invoke("font:add"),
  removeTitleFont: (name: string) => ipcRenderer.invoke("font:remove", name),
  titleFontUrl: (name: string) => ipcRenderer.invoke("font:url", name),
  listVaults: () => ipcRenderer.invoke("vault:list"),
  addVault: () => ipcRenderer.invoke("vault:add"),
  useVault: (path) => ipcRenderer.invoke("vault:use", path),
  forgetVault: (path) => ipcRenderer.invoke("vault:forget", path),
  encryptVault: (path) => ipcRenderer.invoke("vault:encrypt", path),
  decryptVault: (path) => ipcRenderer.invoke("vault:decrypt", path),
  unlockVault: (path, recoveryKey) => ipcRenderer.invoke("vault:unlock", path, recoveryKey)
}

const events: EventsApi = {
  onNotesChanged: (listener) => {
    // The raw IpcRendererEvent is deliberately not forwarded — the renderer
    // has no business with sender handles.
    const handler = (): void => listener()
    ipcRenderer.on("notes:changed", handler)
    return () => {
      ipcRenderer.removeListener("notes:changed", handler)
    }
  }
}

contextBridge.exposeInMainWorld("tova", {
  notes,
  backups,
  images,
  blogs,
  publish: publishing,
  spellcheck,
  preferences,
  session,
  app: appInfo,
  events
})

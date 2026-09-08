import { contextBridge, ipcRenderer } from "electron"
import type {
  AppApi,
  NoteApi,
  BackupApi,
  BlogApi,
  EventsApi,
  ImageApi,
  PublishApi,
  PublishUpdate
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
  setFavorite: (id, favorite) => ipcRenderer.invoke("note:favorite", id, favorite)
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
  remove: (id) => ipcRenderer.invoke("blog:delete", id),
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
  app: appInfo,
  events
})

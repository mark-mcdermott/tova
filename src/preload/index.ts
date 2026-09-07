import { contextBridge, ipcRenderer } from "electron"
import type { NoteApi, BackupApi, EventsApi } from "../shared/types"

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

contextBridge.exposeInMainWorld("tova", { notes, backups, events })

import { contextBridge, ipcRenderer } from "electron"
import type { NoteApi } from "../shared/types"

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
  listFolders: () => ipcRenderer.invoke("folder:list"),
  createFolder: (name) => ipcRenderer.invoke("folder:create", name)
}

contextBridge.exposeInMainWorld("tova", { notes })

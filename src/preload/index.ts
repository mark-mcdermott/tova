import { contextBridge } from "electron"

contextBridge.exposeInMainWorld("electron", {
  // IPC handlers added in Phase 2
})
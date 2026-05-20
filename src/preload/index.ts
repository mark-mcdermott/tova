import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electron", {
  writeTemp: (content: string) => ipcRenderer.invoke("note:write-temp", content)
})
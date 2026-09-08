import { app, ipcMain, shell } from "electron"
import { AppInfo } from "../../shared/types"
import { backupRoot } from "../backup"
import { vaultRoot } from "../vault"

export function registerAppHandlers(): void {
  ipcMain.handle(
    "app:info",
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      vaultPath: vaultRoot(),
      backupPath: backupRoot()
    })
  )

  // Only http(s) is ever opened, and only in the OS browser — a renderer that
  // could hand any string to the shell could open a file or a script.
  ipcMain.handle("app:openExternal", async (_event, url) => {
    if (typeof url !== "string") throw new Error("url must be a string")
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Refusing to open ${parsed.protocol} links`)
    }
    await shell.openExternal(parsed.toString())
  })

  // Only the two vault directories are ever revealed — the renderer names which
  // one, never a path.
  ipcMain.handle("app:reveal", async (_event, target) => {
    const path = target === "backups" ? backupRoot() : vaultRoot()
    await shell.openPath(path)
  })
}

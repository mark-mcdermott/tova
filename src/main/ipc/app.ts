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

  // Only the two vault directories are ever revealed — the renderer names which
  // one, never a path.
  ipcMain.handle("app:reveal", async (_event, target) => {
    const path = target === "backups" ? backupRoot() : vaultRoot()
    await shell.openPath(path)
  })
}

import { ipcMain } from "electron"
import { runBackup, listBackups, restoreBackup, listVersions, readVersion } from "../backup"
import { listNotes } from "../notes"
import { VaultStatus } from "../../shared/types"

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

export function registerBackupHandlers(): void {
  ipcMain.handle("backup:run", () => runBackup())
  ipcMain.handle("backup:list", () => listBackups())
  ipcMain.handle("backup:restore", (_event, name) => restoreBackup(asString(name, "name")))

  ipcMain.handle("backup:status", async (): Promise<VaultStatus> => {
    const [notes, backups] = await Promise.all([listNotes(), listBackups()])
    return { empty: notes.length === 0, backups }
  })

  ipcMain.handle("backup:listVersions", (_event, noteId) =>
    listVersions(asString(noteId, "noteId"))
  )

  ipcMain.handle("backup:readVersion", (_event, noteId, version) =>
    readVersion(asString(noteId, "noteId"), asString(version, "version"))
  )
}

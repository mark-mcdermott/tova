import { app, ipcMain, shell, webContents } from "electron"
import { AppInfo } from "../../shared/types"
import { backupRoot } from "../backup"
import { vaultRoot } from "../vault"
import { readPreferences, writePreferences } from "../preferences"
import { avatarDataUrl, chooseAvatar } from "../avatar"
import { addBackground, listBackgrounds } from "../backgrounds"
import {
  addToDictionary,
  listDictionary,
  removeFromDictionary,
  setSpellcheckEnabled
} from "../spellcheck"

export function registerAppHandlers(): void {
  ipcMain.handle("spellcheck:replace", (event, word) => {
    if (typeof word !== "string") throw new Error("word must be a string")
    // Chromium knows which range the context menu was opened on; replacing
    // through it keeps the editor's own undo history intact.
    webContents.fromId(event.sender.id)?.replaceMisspelling(word)
  })

  ipcMain.handle("spellcheck:addWord", async (_event, word) => {
    if (typeof word !== "string") throw new Error("word must be a string")
    addToDictionary(word)
    return listDictionary()
  })

  ipcMain.handle("spellcheck:removeWord", async (_event, word) => {
    if (typeof word !== "string") throw new Error("word must be a string")
    removeFromDictionary(word)
    return listDictionary()
  })

  ipcMain.handle("spellcheck:listWords", () => listDictionary())

  ipcMain.handle("prefs:read", () => readPreferences())
  ipcMain.handle("prefs:write", (_event, preferences) => writePreferences(preferences))
  ipcMain.handle("prefs:chooseAvatar", () => chooseAvatar())
  ipcMain.handle("prefs:avatarUrl", () => avatarDataUrl())

  ipcMain.handle("background:list", () => listBackgrounds())
  ipcMain.handle("background:add", () => addBackground())

  ipcMain.handle("spellcheck:setEnabled", (_event, enabled) => {
    if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean")
    setSpellcheckEnabled(enabled)
  })

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

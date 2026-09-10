import { app, ipcMain, shell, webContents } from "electron"
import { AppInfo } from "../../shared/types"
import { backupRoot } from "../backup"
import { vaultRoot } from "../vault"
import { readPreferences, writePreferences } from "../preferences"
import { avatarDataUrl, chooseAvatar } from "../avatar"
import { addBackground, listBackgrounds } from "../backgrounds"
import { readSession, writeSession } from "../session"
import { addTitleFont, listTitleFonts, removeTitleFont, titleFontDataUrl } from "../titleFonts"
import { addVault, forgetVault, listVaults, useVault } from "../vaults"
import {
  addToDictionary,
  listDictionary,
  removeFromDictionary,
  setSpellcheckEnabled
} from "../spellcheck"

/** Everything from the renderer is untrusted; a path must at least be a string. */
function asString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`Expected ${name} to be a string`)
  return value
}

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

  ipcMain.handle("session:read", () => readSession())
  ipcMain.handle("session:write", (_event, screen: unknown) => writeSession(screen))

  ipcMain.handle("prefs:read", () => readPreferences())
  ipcMain.handle("prefs:write", (_event, preferences) => writePreferences(preferences))
  ipcMain.handle("prefs:chooseAvatar", () => chooseAvatar())
  ipcMain.handle("prefs:avatarUrl", () => avatarDataUrl())

  ipcMain.handle("background:list", () => listBackgrounds())
  ipcMain.handle("background:add", () => addBackground())
  ipcMain.handle("font:list", () => listTitleFonts())
  ipcMain.handle("font:add", () => addTitleFont())
  ipcMain.handle("font:remove", (_event, name: string) => removeTitleFont(name))
  ipcMain.handle("font:url", (_event, name: string) => titleFontDataUrl(name))

  ipcMain.handle("vault:list", () => listVaults())
  ipcMain.handle("vault:add", () => addVault())
  ipcMain.handle("vault:use", (_event, path) => useVault(asString(path, "path")))
  ipcMain.handle("vault:forget", (_event, path) => forgetVault(asString(path, "path")))

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

import { ipcMain } from "electron"
import {
  listNotes,
  readNote,
  writeNote,
  createNote,
  renameNote,
  moveNote,
  trashNote,
  restoreNote,
  permanentDelete,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder
} from "../notes"
import { CreateNoteInput, MoveNoteInput, isSection } from "../../shared/types"
import { ensureDailyNote } from "../daily"
import { exportNoteMarkdown } from "../export"

/*
 * Everything arriving here crossed a process boundary from the renderer, so it
 * is untrusted regardless of what the renderer is supposed to send. Shapes are
 * checked before they reach the filesystem; ids are validated again in vault.ts.
 */

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function asSection(value: unknown): CreateNoteInput["section"] {
  const section = asString(value, "section")
  if (!isSection(section)) throw new Error(`Unknown section: ${section}`)
  return section
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function asCreateInput(value: unknown): CreateNoteInput {
  const raw = asRecord(value, "input")
  return {
    section: asSection(raw.section),
    folder: asOptionalString(raw.folder) ?? null,
    title: asOptionalString(raw.title) ?? "",
    body: asOptionalString(raw.body) ?? "",
    filename: asOptionalString(raw.filename)
  }
}

function asMoveInput(value: unknown): MoveNoteInput {
  const raw = asRecord(value, "input")
  return {
    section: asSection(raw.section),
    folder: asOptionalString(raw.folder) ?? null
  }
}

export function registerNoteHandlers(): void {
  ipcMain.handle("note:list", () => listNotes())
  ipcMain.handle("note:read", (_event, id) => readNote(asString(id, "id")))

  ipcMain.handle("note:write", (_event, id, title, body) =>
    writeNote(asString(id, "id"), asString(title, "title"), asString(body, "body"))
  )

  ipcMain.handle("note:create", (_event, input) => createNote(asCreateInput(input)))

  ipcMain.handle("note:rename", (_event, id, title) =>
    renameNote(asString(id, "id"), asString(title, "title"))
  )

  ipcMain.handle("note:move", (_event, id, input) =>
    moveNote(asString(id, "id"), asMoveInput(input))
  )

  ipcMain.handle("note:delete", (_event, id) => trashNote(asString(id, "id")))
  ipcMain.handle("note:restore", (_event, id) => restoreNote(asString(id, "id")))

  ipcMain.handle("note:permanentDelete", (_event, id) =>
    permanentDelete(asString(id, "id"))
  )

  ipcMain.handle("note:today", () => ensureDailyNote())

  ipcMain.handle("folder:list", () => listFolders())
  ipcMain.handle("folder:create", (_event, name) => createFolder(asString(name, "name")))

  ipcMain.handle("folder:rename", (_event, from, to) =>
    renameFolder(asString(from, "from"), asString(to, "to"))
  )

  ipcMain.handle("folder:delete", (_event, name) => deleteFolder(asString(name, "name")))

  ipcMain.handle("note:export", (_event, id) => exportNoteMarkdown(asString(id, "id")))
}

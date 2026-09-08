import { ipcMain } from "electron"
import { PublishRequest } from "../../shared/types"
import { publish } from "../publish/publisher"

function asRequest(value: unknown): PublishRequest {
  if (typeof value !== "object" || value === null) throw new Error("request must be an object")
  const raw = value as Record<string, unknown>

  if (typeof raw.noteId !== "string") throw new Error("noteId must be a string")
  if (typeof raw.blog !== "string") throw new Error("blog must be a string")
  if (typeof raw.headerLine !== "number" || !Number.isInteger(raw.headerLine)) {
    throw new Error("headerLine must be a line number")
  }

  return { noteId: raw.noteId, blog: raw.blog, headerLine: raw.headerLine }
}

export function registerPublishHandlers(): void {
  ipcMain.handle("publish:start", async (event, request) => {
    // Progress goes back to the window that asked, not to every open window.
    const sender = event.sender
    return publish(asRequest(request), (update) => {
      if (!sender.isDestroyed()) sender.send("publish:update", update)
    })
  })
}

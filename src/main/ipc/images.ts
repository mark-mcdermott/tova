import { ipcMain } from "electron"
import { saveImage } from "../images"

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  throw new Error("data must be binary")
}

export function registerImageHandlers(): void {
  ipcMain.handle("image:save", (_event, name, data) =>
    saveImage(asString(name, "name"), asBytes(data))
  )
}

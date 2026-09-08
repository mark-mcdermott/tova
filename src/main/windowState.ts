import { app, BrowserWindow, screen } from "electron"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join } from "path"

/*
 * Where the window was left. Restoring it is only kind if the position is
 * still reachable: a window remembered on a monitor that is no longer attached
 * would open off-screen, which looks exactly like the app failing to start.
 */

export interface WindowState {
  width: number
  height: number
  x: number | null
  y: number | null
  maximized: boolean
}

const DEFAULTS: WindowState = { width: 1280, height: 800, x: null, y: null, maximized: false }

const MIN = { width: 720, height: 480 }

function pathToState(): string {
  return join(app.getPath("userData"), "window.json")
}

export function normalizeWindowState(value: unknown): WindowState {
  if (typeof value !== "object" || value === null) return { ...DEFAULTS }
  const raw = value as Record<string, unknown>

  const size = (key: "width" | "height"): number => {
    const found = raw[key]
    const value = typeof found === "number" && Number.isFinite(found) ? found : DEFAULTS[key]
    return Math.max(Math.round(value), MIN[key])
  }

  const position = (key: "x" | "y"): number | null => {
    const found = raw[key]
    return typeof found === "number" && Number.isFinite(found) ? Math.round(found) : null
  }

  return {
    width: size("width"),
    height: size("height"),
    x: position("x"),
    y: position("y"),
    maximized: raw.maximized === true
  }
}

/** True when the remembered frame still overlaps a display that exists. */
export function isOnScreen(
  state: WindowState,
  areas: { x: number; y: number; width: number; height: number }[]
): boolean {
  if (state.x === null || state.y === null) return false
  const { x, y, width, height } = { ...state, x: state.x, y: state.y }

  return areas.some(
    (area) =>
      x < area.x + area.width &&
      x + width > area.x &&
      y < area.y + area.height &&
      y + height > area.y
  )
}

export async function readWindowState(): Promise<WindowState> {
  try {
    const state = normalizeWindowState(JSON.parse(await readFile(pathToState(), "utf-8")))
    const areas = screen.getAllDisplays().map((display) => display.workArea)
    return isOnScreen(state, areas) ? state : { ...state, x: null, y: null }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Saved on close rather than on every move: the frame only matters as it was
 * left, and writing on each drag event would be a file write per frame.
 */
export function rememberWindowState(win: BrowserWindow): void {
  win.on("close", () => {
    // A maximized window reports the maximized frame, which is not the size to
    // restore to; getNormalBounds gives the one underneath it.
    const bounds = win.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized()
    }

    const path = pathToState()
    void mkdir(dirname(path), { recursive: true })
      .then(() => writeFile(path, JSON.stringify(state, null, 2), "utf-8"))
      .catch((error: unknown) => console.error("Could not remember the window", error))
  })
}

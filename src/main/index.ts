import { app, BrowserWindow } from "electron"
import { join } from "path"
import { ensureVault } from "./vault"
import { registerNoteHandlers } from "./ipc/notes"
import { registerBackupHandlers } from "./ipc/backup"
import { runBackup } from "./backup"
import { cleanupBlankDailyNotes, ensureDailyNote, startDailyNoteSchedule } from "./daily"

const BACKUP_INTERVAL_MS = 60 * 60 * 1000

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#14121c",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Showing only once the first frame is painted avoids a white flash against
  // the dark window background.
  win.once("ready-to-show", () => win.show())

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

function reportBackupFailure(error: unknown): void {
  // A failed backup must never take the app down, but it must not pass silently.
  console.error("Backup failed", error)
}

function scheduleBackups(): void {
  setInterval(() => {
    runBackup().catch(reportBackupFailure)
  }, BACKUP_INTERVAL_MS)
}

app.whenReady().then(async () => {
  await ensureVault()

  // The launch backup runs before cleanup, so anything the sweep removes is
  // already captured in a restorable snapshot.
  await runBackup().catch(reportBackupFailure)
  await cleanupBlankDailyNotes().catch((error: unknown) => {
    console.error("Daily note cleanup failed", error)
  })
  await ensureDailyNote().catch((error: unknown) => {
    console.error("Could not create today's daily note", error)
  })

  registerNoteHandlers()
  registerBackupHandlers()
  scheduleBackups()
  startDailyNoteSchedule((error) => console.error("Midnight note creation failed", error))

  createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

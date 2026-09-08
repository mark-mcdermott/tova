import { app, BrowserWindow, net, powerMonitor, protocol } from "electron"
import { join } from "path"
import { pathToFileURL } from "url"
import { ensureVault, resolveInVault } from "./vault"
import { registerNoteHandlers } from "./ipc/notes"
import { registerBackupHandlers } from "./ipc/backup"
import { registerImageHandlers } from "./ipc/images"
import { registerAppHandlers } from "./ipc/app"
import { registerBlogHandlers } from "./ipc/blogs"
import { registerPublishHandlers } from "./ipc/publish"
import { runBackup } from "./backup"
import { cleanupBlankDailyNotes, ensureDailyNote, startDailyNoteSchedule } from "./daily"

const BACKUP_INTERVAL_MS = 60 * 60 * 1000

/*
 * Images live in the vault, not in the bundle, so the renderer cannot reach
 * them over file:// from its own origin. This scheme is the only window onto
 * the vault the page gets, and every request through it is resolved by the same
 * choke point that guards note writes.
 */
const ASSET_SCHEME = "tova-asset"

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function serveVaultAssets(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const file = resolveInVault(decodeURIComponent(pathname).replace(/^\/+/, ""))
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      // A missing or out-of-vault asset is a broken image, never an app error.
      return new Response(null, { status: 404 })
    }
  })
}

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

/** Tells every open window the vault changed underneath it. */
function broadcastNotesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("notes:changed")
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

  serveVaultAssets()
  registerNoteHandlers()
  registerBackupHandlers()
  registerImageHandlers()
  registerAppHandlers()
  registerBlogHandlers()
  registerPublishHandlers()
  scheduleBackups()

  const daily = startDailyNoteSchedule({
    onCreated: broadcastNotesChanged,
    onError: (error) => console.error("Daily note creation failed", error)
  })

  // A midnight timeout cannot be trusted across a suspend, so the same check
  // runs whenever the machine wakes or the user comes back to the app.
  powerMonitor.on("resume", daily.refresh)
  app.on("activate", daily.refresh)
  app.on("browser-window-focus", daily.refresh)
  app.on("before-quit", daily.stop)

  createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

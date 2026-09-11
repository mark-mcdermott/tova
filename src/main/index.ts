import { app, BrowserWindow, net, powerMonitor, protocol } from "electron"
import { extname, join } from "path"
import { pathToFileURL } from "url"
import { ensureVault, resolveInVault, setActiveVault, vaultRoot } from "./vault"
import { readVaultBytes } from "./vaultFile"
import { unlockVault } from "./vaultKeys"
import { findBackground } from "./backgrounds"
import { registerNoteHandlers } from "./ipc/notes"
import { registerBackupHandlers } from "./ipc/backup"
import { registerImageHandlers } from "./ipc/images"
import { registerAppHandlers } from "./ipc/app"
import { registerBlogHandlers } from "./ipc/blogs"
import { registerPublishHandlers } from "./ipc/publish"
import { configureSpellcheck, setSpellcheckEnabled } from "./spellcheck"
import { readPreferences } from "./preferences"
import { readWindowState, rememberWindowState } from "./windowState"
import { runBackup } from "./backup"
import { cleanupBlankDailyNotes, ensureDailyNote, startDailyNoteSchedule } from "./daily"

/*
 * Images live in the vault, not in the bundle, so the renderer cannot reach
 * them over file:// from its own origin. This scheme is the only window onto
 * the vault the page gets, and every request through it is resolved by the same
 * choke point that guards note writes.
 */
const ASSET_SCHEME = "tova-asset"

/** Enough of a table for what a note can hold; anything else is served raw. */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
}

function mimeOf(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? "application/octet-stream"
}
/** Backgrounds the reader added; they live in userData, not in the vault. */
const BACKGROUND_SCHEME = "tova-bg"

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: BACKGROUND_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function serveVaultAssets(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const file = resolveInVault(decodeURIComponent(pathname).replace(/^\/+/, ""))
      // Read rather than fetched: in an encrypted vault the bytes on disk are
      // a sealed envelope, and the picture is what comes out of it.
      const bytes = await readVaultBytes(file)
      return new Response(new Uint8Array(bytes), {
        headers: { "content-type": mimeOf(file) }
      })
    } catch {
      // A missing or out-of-vault asset is a broken image, never an app error.
      return new Response(null, { status: 404 })
    }
  })
}

/*
 * The same window for backgrounds, onto a different directory. A separate
 * scheme rather than a path prefix on the vault's, so neither handler can ever
 * be talked into serving the other's files.
 */
function serveBackgrounds(): void {
  protocol.handle(BACKGROUND_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url)
      // By name alone: a stored preference is a bare filename, so which of the
      // two folders holds it is this side's problem rather than the URL's.
      const file = await findBackground(decodeURIComponent(pathname).replace(/^\/+/, ""))
      if (file === null) return new Response(null, { status: 404 })
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

async function createWindow(): Promise<void> {
  const state = await readWindowState()

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x === null || state.y === null ? {} : { x: state.x, y: state.y }),
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

  if (state.maximized) win.maximize()
  rememberWindowState(win)

  // Showing only once the first frame is painted avoids a white flash against
  // the dark window background.
  win.once("ready-to-show", () => win.show())

  configureSpellcheck(win)
  void readPreferences().then(({ spellcheck }) => setSpellcheckEnabled(spellcheck))

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

/**
 * Re-read on every tick rather than captured once, so changing the schedule in
 * Settings takes effect without a restart. The timer runs at the shortest
 * interval the preference allows and skips the ticks that are too early.
 */
function scheduleBackups(): void {
  const TICK_MS = 5 * 60 * 1000
  let lastRun = Date.now()

  setInterval(() => {
    void readPreferences()
      .then(async ({ backupIntervalMinutes, backupLimit }) => {
        if (Date.now() - lastRun < backupIntervalMinutes * 60 * 1000) return
        lastRun = Date.now()
        await runBackup(backupLimit)
      })
      .catch(reportBackupFailure)
  }, TICK_MS)
}

app.whenReady().then(async () => {
  // Before anything touches the vault: which one is open is a preference.
  const { activeVault } = await readPreferences()
  setActiveVault(activeVault)
  // Before ensureVault, which writes: a sealed vault has to be open first or
  // the directories it makes go in beside files it can no longer read.
  await unlockVault(vaultRoot())
  await ensureVault()

  // The launch backup runs before cleanup, so anything the sweep removes is
  // already captured in a restorable snapshot.
  const preferences = await readPreferences()
  await runBackup(preferences.backupLimit).catch(reportBackupFailure)
  await cleanupBlankDailyNotes().catch((error: unknown) => {
    console.error("Daily note cleanup failed", error)
  })
  await ensureDailyNote().catch((error: unknown) => {
    console.error("Could not create today's daily note", error)
  })

  serveVaultAssets()
  serveBackgrounds()
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

  await createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

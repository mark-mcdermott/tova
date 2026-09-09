/*
 * Places tools/icon-source.png on the 1024x1024 canvas macOS expects and writes
 * build/icon.png. The source lives in the repo rather than beside it, so a
 * fresh clone can rebuild the icon — the artwork is the one input the script
 * cannot regenerate. The artwork is supplied rather than drawn, so all this does
 * is scale it to the 824px body and centre it — but it stays a script so the
 * icon can be rebuilt when the artwork changes, instead of being a binary
 * somebody once produced by hand.
 *
 * Electron is already the project's rasteriser, so this needs no image
 * toolchain of its own.
 *
 *   npx electron tools/make-icon.js
 */
const { app, BrowserWindow } = require("electron")
const { writeFile } = require("fs/promises")
const { join } = require("path")

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: false }
  })

  await win.loadFile(join(__dirname, "icon.html"))
  // The artwork loads from disk; give it a beat to decode.
  await new Promise((resolve) => setTimeout(resolve, 600))

  // capturePage() shoots at the display's scale factor, so on a Retina Mac this
  // comes back 2048 wide. Resize here rather than leaving it to `sips`, which
  // is macOS-only and easy to drop by mistake.
  const image = (await win.capturePage()).resize({ width: 1024, height: 1024, quality: "best" })
  await writeFile(join(__dirname, "..", "build", "icon.png"), image.toPNG())

  console.log("build/icon.png written")
  app.quit()
})

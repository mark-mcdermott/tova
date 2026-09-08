/*
 * Renders tools/icon.html at 1024x1024 and writes build/icon.png, then leaves
 * `sips` and `iconutil` to make the .icns. Electron is already the project's
 * rasteriser, so the icon is built with the same engine that draws the app
 * rather than by adding an image toolchain.
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
  // The bundled face loads from disk; give it a beat to be applied.
  await new Promise((resolve) => setTimeout(resolve, 600))

  const image = await win.capturePage()
  await writeFile(join(__dirname, "..", "build", "icon.png"), image.toPNG())

  console.log("build/icon.png written")
  app.quit()
})

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/**
 * The renderer on its own, for `cargo tauri dev`.
 *
 * Separate from `vite.config.ts` because that one is electron-vite's, and
 * electron-vite's dev server launches Electron alongside it — `--rendererOnly`
 * skips rebuilding the main process but still starts the app, which would put
 * two windows on screen for one command.
 *
 * `strictPort` because `devUrl` in tauri.conf.json names a port. Left to find
 * another, the dev server comes up somewhere Tauri is not looking and the
 * window loads whatever happened to be on 5173 — which is a confusing way to
 * spend ten minutes.
 */
export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  server: { port: 5173, strictPort: true }
})

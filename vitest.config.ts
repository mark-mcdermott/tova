import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

/*
 * Kept separate from vite.config.ts: that file is an electron-vite config whose
 * top level is main/preload/renderer, so a `test` block nested inside it is
 * silently ignored by Vitest.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // jsdom does not implement the geometry CodeMirror measures with.
    setupFiles: ["./src/renderer/testing/setup.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true
  }
})

import { defineConfig } from "electron-vite"
import { mergeConfig } from "vite"
import { defineConfig as defineVitestConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  main: {},
  preload: {},
  renderer: mergeConfig(
    {
      plugins: [react(), tailwindcss()],
    },
    defineVitestConfig({
      test: {
        environment: "jsdom",
        globals: true
      }
    })
  )
})
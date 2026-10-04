import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/**
 * The static build Capacitor wraps.
 *
 * Astro builds the web half, and it builds it for a server: `/app` is a page
 * with an adapter behind it, and there is no server inside a phone. This is
 * the same island as a plain Vite build — one HTML file and its bundle, which
 * is what a native shell can hold and open with no network at all.
 *
 * `outDir` is `out/mobile`, which is what `webDir` in capacitor.config.ts
 * names. Stated here rather than defaulted because the root is `mobile/`, and
 * Vite would otherwise write the build inside the source tree.
 */
export default defineConfig({
  root: "mobile",
  plugins: [react()],
  build: { outDir: "../out/mobile", emptyOutDir: true }
})

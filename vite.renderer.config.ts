import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/**
 * The renderer — served for `cargo tauri dev`, built for `cargo tauri build`.
 *
 * `strictPort` because `devUrl` in tauri.conf.json names a port. Left to find
 * another, the dev server comes up somewhere Tauri is not looking and the
 * window loads whatever happened to be on 5173 — which is a confusing way to
 * spend ten minutes.
 *
 * `outDir` is where `frontendDist` in tauri.conf.json looks, and it is stated
 * here rather than left to default because the root is `src/renderer`: Vite
 * would otherwise write the build inside the source tree.
 */
export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "../../out/renderer", emptyOutDir: true },

  /*
   * Harper finds its own WebAssembly with `new URL("….wasm", import.meta.url)`.
   * Pre-bundled, `import.meta.url` points into node_modules/.vite/deps, where
   * the .wasm was never copied — so the dev server answers the request with
   * index.html and the grammar checker dies on `module doesn't start with
   * '\0asm'`. Left where it lives, the binary sits beside the JS that asks
   * for it. The production build resolves this on its own and emits the file.
   */
  optimizeDeps: { exclude: ["harper.js"] }
})

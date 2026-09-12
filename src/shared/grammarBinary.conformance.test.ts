/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * Harper finds its own WebAssembly with `new URL("….wasm", import.meta.url)`.
 *
 * Pre-bundled by the dev server's dependency optimizer, `import.meta.url`
 * points into node_modules/.vite/deps — where the .wasm was never copied. The
 * request falls through to the page handler, the checker is handed index.html,
 * and it dies on `module doesn't start with '\0asm'`. Grammar then underlines
 * nothing at all, because the editor catches that and carries on: a checker
 * that will not load is not a reason to stop writing.
 *
 * One line of configuration with no visible effect and a whole feature behind
 * it, which is the kind of line that gets tidied away.
 *
 * Read rather than imported: importing a Vite config drags in its plugins, and
 * one of them will not start inside jsdom.
 */
const config = readFileSync("vite.renderer.config.ts", "utf-8")

describe("the grammar checker's WebAssembly", () => {
  it("is left where the code that asks for it expects to find it", () => {
    const excluded = /optimizeDeps:\s*\{[^}]*exclude:\s*\[([^\]]*)\]/.exec(config)
    expect(excluded?.[1]).toContain('"harper.js"')
  })

  it("is still the package that needs this", () => {
    const linter = readFileSync("src/renderer/grammarLinter.ts", "utf-8")
    expect(linter).toContain('import("harper.js")')
  })
})

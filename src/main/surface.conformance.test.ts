import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * The one invariant the whole Tauri port rests on: the IPC surface does not
 * move. Every method the renderer can call has to exist under the same name on
 * both backends, or a component works under one and throws under the other —
 * and finds out at the moment somebody clicks it.
 *
 * Until now that was maintained by hand. This is the check.
 *
 * The preload is the source of truth rather than types.ts, and it can be:
 * every object in it is annotated with its interface, so `pnpm run check`
 * already refuses a preload that is missing a method or carries an extra one.
 * That makes its keys a list TypeScript has verified.
 */
const preload = readFileSync("src/preload/index.ts", "utf-8")
const bridge = readFileSync("src-tauri/bridge.js", "utf-8")

/** `const notes: NoteApi = { … }`, and the keys inside it. */
function preloadSurface(): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>()

  // The name the object is exposed under, which is not always the variable:
  // `publish: publishing`, `app: appInfo`.
  const exposed = /exposeInMainWorld\("tova",\s*\{([\s\S]*?)\n\}\)/.exec(preload)
  if (exposed === null) throw new Error("Could not find what the preload exposes")

  const names = new Map<string, string>()
  for (const line of exposed[1].split("\n")) {
    const entry = /^\s*(\w+)(?::\s*(\w+))?,?\s*$/.exec(line)
    if (entry !== null) names.set(entry[2] ?? entry[1], entry[1])
  }

  for (const [variable, group] of names) {
    const declared = new RegExp(`const ${variable}: \\w+ = \\{([\\s\\S]*?)\\n\\}`).exec(preload)
    if (declared === null) throw new Error(`Could not find the preload's ${variable}`)

    // Only keys at the object's own indent level; a nested handler is not one.
    const methods = new Set<string>()
    for (const line of declared[1].split("\n")) {
      const key = /^ {2}(\w+):/.exec(line)
      if (key !== null) methods.add(key[1])
    }
    groups.set(group, methods)
  }

  return groups
}

/** The SURFACE table the bridge builds its throwers from. */
function bridgeSurface(): Map<string, Set<string>> {
  const table = /const SURFACE = \{([\s\S]*?)\n {2}\}/.exec(bridge)
  if (table === null) throw new Error("Could not find the bridge's SURFACE")

  const groups = new Map<string, Set<string>>()
  for (const [, group, body] of table[1].matchAll(/(\w+): \[([\s\S]*?)\]/g)) {
    groups.set(group, new Set([...body.matchAll(/"(\w+)"/g)].map((match) => match[1])))
  }
  return groups
}

/** `tova.notes.list = …` — what the bridge has actually ported. */
function ported(): Set<string> {
  const body = bridge.slice(bridge.indexOf("// Ported so far"))
  return new Set([...body.matchAll(/tova\.(\w+)\.(\w+) =/g)].map(([, g, m]) => `${g}.${m}`))
}

const fromPreload = preloadSurface()
const fromBridge = bridgeSurface()

describe("the two backends offer the same thing to the renderer", () => {
  it("found a surface worth comparing, on both sides", () => {
    // A parse that quietly matched nothing would make every assertion below
    // pass without checking anything.
    const count = (groups: Map<string, Set<string>>): number =>
      [...groups.values()].reduce((total, methods) => total + methods.size, 0)

    expect(fromPreload.size).toBeGreaterThan(5)
    expect(count(fromPreload)).toBeGreaterThan(60)
    expect(count(fromBridge)).toBe(count(fromPreload))
  })

  it("names the same groups", () => {
    expect([...fromBridge.keys()].sort()).toEqual([...fromPreload.keys()].sort())
  })

  it.each([...fromPreload.keys()])("names the same methods under %s", (group) => {
    expect([...(fromBridge.get(group) ?? [])].sort()).toEqual(
      [...(fromPreload.get(group) ?? [])].sort()
    )
  })

  it("ports nothing the renderer cannot ask for", () => {
    // The direction that would otherwise go unnoticed: a Tauri command wired
    // to a name the Electron side does not have is a method that only ever
    // works on one backend.
    const known = new Set(
      [...fromPreload].flatMap(([group, methods]) => [...methods].map((m) => `${group}.${m}`))
    )

    expect([...ported()].filter((name) => !known.has(name))).toEqual([])
  })
})

describe("what is left of the port", () => {
  it("is the native handful, and says so out loud", () => {
    /*
     * Not a target to beat — a record of which methods still throw under
     * Tauri, so the list cannot shrink by accident or grow without somebody
     * noticing. Both of those have happened to the count in a PR description.
     */
    const all = [...fromPreload].flatMap(([group, methods]) =>
      [...methods].map((m) => `${group}.${m}`)
    )
    const done = ported()

    expect(all.filter((name) => !done.has(name)).sort()).toEqual([
      "spellcheck.addWord",
      "spellcheck.listWords",
      "spellcheck.onSuggest",
      "spellcheck.removeWord",
      "spellcheck.replace",
      "spellcheck.setEnabled"
    ])
  })
})

// Reads three source files, so it says so — this compiles under the renderer's
// tsconfig too, and that one does not expect Node.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * The one invariant the whole Tauri port rests on: the IPC surface does not
 * move. Every method the renderer can call has to exist under the same name in
 * the bridge, or a component works in one build and throws in the other — and
 * finds out at the moment somebody clicks it.
 *
 * The source of truth is the renderer's own declaration of `window.tova` and
 * the interfaces behind it. That is a contract TypeScript already enforces
 * from the other side: a component calling a method that is not there fails
 * `pnpm run check`. This checks the bridge against the same declaration.
 *
 * It used to read the Electron preload instead, which was the same list by a
 * longer route and does not outlive the cutover.
 */
const declaration = readFileSync("src/renderer/tova.d.ts", "utf-8")
const types = readFileSync("src/shared/types.ts", "utf-8")
const bridge = readFileSync("src-tauri/bridge.js", "utf-8")

/** `notes: NoteApi` inside `tova: { … }` — the groups and what describes them. */
function groupInterfaces(): Map<string, string> {
  const exposed = /tova:\s*\{([\s\S]*?)\n {4}\}/.exec(declaration)
  if (exposed === null) throw new Error("Could not find what window.tova is declared as")

  const groups = new Map<string, string>()
  for (const [, group, name] of exposed[1].matchAll(/(\w+):\s*(\w+)/g)) groups.set(group, name)
  return groups
}

/** The members of one interface, at its own indent — a nested type is not one. */
function members(name: string): Set<string> {
  const declared = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(types)
  if (declared === null) throw new Error(`Could not find ${name} in types.ts`)

  const found = new Set<string>()
  for (const line of declared[1].split("\n")) {
    const member = /^ {2}(\w+)\??:/.exec(line)
    if (member !== null) found.add(member[1])
  }
  return found
}

function rendererSurface(): Map<string, Set<string>> {
  return new Map([...groupInterfaces()].map(([group, name]) => [group, members(name)]))
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

/** `tova.notes.list = …` — what the bridge has actually wired up. */
function wired(): Set<string> {
  const body = bridge.slice(bridge.indexOf("// Ported so far"))
  return new Set([...body.matchAll(/tova\.(\w+)\.(\w+) =/g)].map(([, g, m]) => `${g}.${m}`))
}

const fromRenderer = rendererSurface()
const fromBridge = bridgeSurface()

const count = (groups: Map<string, Set<string>>): number =>
  [...groups.values()].reduce((total, methods) => total + methods.size, 0)

describe("the bridge offers the renderer what the renderer asks for", () => {
  it("found a surface worth comparing, on both sides", () => {
    // A parse that quietly matched nothing would make every assertion below
    // pass without checking anything.
    expect(fromRenderer.size).toBeGreaterThan(5)
    expect(count(fromRenderer)).toBeGreaterThan(60)
    expect(count(fromBridge)).toBe(count(fromRenderer))
  })

  it("names the same groups", () => {
    expect([...fromBridge.keys()].sort()).toEqual([...fromRenderer.keys()].sort())
  })

  it.each([...fromRenderer.keys()])("names the same methods under %s", (group) => {
    expect([...(fromBridge.get(group) ?? [])].sort()).toEqual(
      [...(fromRenderer.get(group) ?? [])].sort()
    )
  })

  it("wires nothing the renderer cannot ask for", () => {
    // The direction that would otherwise go unnoticed: a Tauri command wired
    // to a name that is not in the surface is a method nothing can reach.
    const known = new Set(
      [...fromRenderer].flatMap(([group, methods]) => [...methods].map((m) => `${group}.${m}`))
    )

    expect([...wired()].filter((name) => !known.has(name))).toEqual([])
  })

  it("answers every one of them", () => {
    /*
     * Kept in this shape rather than as a count: a method added to the surface
     * and wired on only one side fails here, which is the state this whole
     * file exists to make impossible to reach quietly.
     */
    const all = [...fromRenderer].flatMap(([group, methods]) =>
      [...methods].map((m) => `${group}.${m}`)
    )
    const done = wired()

    expect(all.filter((name) => !done.has(name))).toEqual([])
  })
})

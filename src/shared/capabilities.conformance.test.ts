/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

/*
 * What the bridge is allowed to call.
 *
 * Tauri refuses any core command a capability file does not name, and says so
 * only as a rejected promise in the webview's console. There was no capability
 * file at all: `startDragging` was refused, so the header did not move, and
 * `event.listen` was refused, so nothing that watches for a change on disk
 * ever heard one. Neither failure printed anything a person would see.
 *
 * A missing permission is therefore invisible by construction, which is what
 * this checks — the bridge names the calls, the capability names the
 * permissions, and the two have to agree.
 */
const bridge = readFileSync("src-tauri/bridge.js", "utf-8")
const capability = JSON.parse(readFileSync("src-tauri/capabilities/main.json", "utf-8")) as {
  windows: string[]
  permissions: string[]
}

/** `moveWindow("startDragging")` → `start-dragging`, which is how the permission is spelled. */
function windowCallsInBridge(): Set<string> {
  const calls = new Set<string>()
  for (const [, method] of bridge.matchAll(/moveWindow\("(\w+)"\)/g)) {
    calls.add(method.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
  }
  return calls
}

describe("what the bridge is allowed to call", () => {
  it("finds the window calls it is checking, rather than passing on an empty set", () => {
    expect(windowCallsInBridge().size).toBeGreaterThan(0)
  })

  it("grants a permission for every window command the bridge uses", () => {
    const granted = new Set(capability.permissions)
    for (const call of windowCallsInBridge()) {
      expect(granted, `bridge.js calls ${call} on the window`).toContain(
        `core:window:allow-${call}`
      )
    }
  })

  /*
   * Not derivable from a call the way the window ones are, and load-bearing:
   * with this line removed the app still starts, still opens notes, and still
   * saves them — it just stops noticing when anything changes.
   */
  it("grants events, which is what every listener in the bridge needs", () => {
    expect(bridge).toMatch(/runtime\(\)\.event\.listen/)
    expect(capability.permissions).toContain("core:event:default")
  })

  it("applies to the window the bridge is injected into", () => {
    expect(capability.windows).toContain("main")
  })
})

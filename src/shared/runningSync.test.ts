import { describe, it, expect, vi, beforeEach } from "vitest"
import { isRunning, register, syncNow, unregister } from "./runningSync"

beforeEach(() => void unregister())

describe("the sync that is running", () => {
  it("says nothing is going before anything registers", () => {
    expect(isRunning()).toBe(false)
  })

  it("runs the one that registered", async () => {
    const now = vi.fn(async () => undefined)
    register({ now, stop: () => {} })

    await syncNow()

    expect(now).toHaveBeenCalledOnce()
  })

  /*
   * Both hosts start a sync, and on the desktop two things do: the app opening
   * and somebody signing in. Two runners against one vault push the same note
   * twice and have the second refused as stale, which reads as a sync that
   * keeps failing rather than as two of them.
   */
  it("stops the one it is taking over from", () => {
    const stop = vi.fn()
    register({ now: async () => {}, stop })

    register({ now: async () => {}, stop: () => {} })

    expect(stop).toHaveBeenCalledOnce()
  })

  it("does not stop the one already registered when it registers again", () => {
    const stop = vi.fn()
    const only = { now: async () => {}, stop }

    register(only)
    register(only)

    expect(stop).not.toHaveBeenCalled()
  })

  /*
   * A screen may ask for a sync before one is going — on the web, before the
   * key has been recalled. Nothing to run is not an error.
   */
  it("resolves rather than throwing when nothing is going", async () => {
    await expect(syncNow()).resolves.toBeUndefined()
  })

  it("stops what it is holding when it lets go", () => {
    const stop = vi.fn()
    register({ now: async () => {}, stop })

    unregister()

    expect(stop).toHaveBeenCalledOnce()
    expect(isRunning()).toBe(false)
  })
})

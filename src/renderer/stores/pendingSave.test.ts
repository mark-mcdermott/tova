import { describe, it, expect, vi, afterEach } from "vitest"
import { registerPendingSave, flushPendingSave } from "./pendingSave"

afterEach(() => {
  // Leave no registration behind for the next test.
  registerPendingSave(async () => undefined)()
})

describe("pendingSave", () => {
  it("does nothing when no editor is mounted", async () => {
    await expect(flushPendingSave()).resolves.toBeUndefined()
  })

  it("runs the registered flush", async () => {
    const flush = vi.fn(async () => undefined)
    registerPendingSave(flush)

    await flushPendingSave()
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("awaits the flush rather than firing and forgetting", async () => {
    const order: string[] = []
    registerPendingSave(async () => {
      await Promise.resolve()
      order.push("saved")
    })

    await flushPendingSave()
    order.push("moved")
    expect(order).toEqual(["saved", "moved"])
  })

  it("stops running a flush once its editor unregisters", async () => {
    const flush = vi.fn(async () => undefined)
    const unregister = registerPendingSave(flush)
    unregister()

    await flushPendingSave()
    expect(flush).not.toHaveBeenCalled()
  })

  it("keeps the newest registration when editors swap", async () => {
    const older = vi.fn(async () => undefined)
    const newer = vi.fn(async () => undefined)
    const unregisterOlder = registerPendingSave(older)
    registerPendingSave(newer)
    // The previous editor tearing down must not clear the current one.
    unregisterOlder()

    await flushPendingSave()
    expect(newer).toHaveBeenCalledTimes(1)
    expect(older).not.toHaveBeenCalled()
  })
})

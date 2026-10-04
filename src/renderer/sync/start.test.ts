import { describe, it, expect, vi, beforeEach } from "vitest"
import { startDesktopSync, stopDesktopSync } from "./start"
import { isRunning } from "../../shared/runningSync"
import type { TovaBridge } from "../../shared/types"

function fakeSync(over: Partial<TovaBridge["sync"]> = {}) {
  const sync = {
    key: vi.fn(async () => null),
    account: vi.fn(async () => null),
    ...over
  } as unknown as TovaBridge["sync"]

  window.tova = { sync } as unknown as TovaBridge
  return sync
}

beforeEach(() => {
  vi.restoreAllMocks()
  // The runner is module-level, so one test leaving one going is the next
  // test starting with somebody else's.
  stopDesktopSync()
})

describe("starting a sync on the desktop", () => {
  /*
   * "Tova opens no connection at all" is one of the three answers to the
   * first-run question, and it has to stay true. The key is answered from this
   * Mac's keychain, so a Mac nobody has signed in on reaches the network not
   * once at launch.
   */
  it("opens no connection on a Mac nobody has signed in on", async () => {
    const sync = fakeSync()

    expect(await startDesktopSync()).toBeNull()
    expect(sync.account).not.toHaveBeenCalled()
  })

  /*
   * A laptop opened on a train. Having a key is enough to start: the runner
   * finds out the server is unreachable, backs off and tries again, which is
   * what being offline is. Asking first would make it an error at launch —
   * and an unhandled one, since this is called without being awaited.
   */
  it("starts anyway when the server cannot be reached", async () => {
    const sync = fakeSync({
      key: vi.fn(async () => new Uint8Array(32)),
      account: vi.fn(async () => {
        throw new Error("offline")
      })
    })

    const running = await startDesktopSync()

    expect(running).not.toBeNull()
    expect(sync.account).not.toHaveBeenCalled()
    running?.runner.stop()
  })

  it("does not throw when the keychain itself refuses", async () => {
    fakeSync({
      key: vi.fn(async () => {
        throw new Error("the keychain said no")
      })
    })

    await expect(startDesktopSync()).resolves.toBeNull()
  })
})

describe("starting it more than once", () => {
  /*
   * Two things start a sync: the app opening, and somebody signing in. The
   * second must not leave the first running alongside it — two runners against
   * one vault push the same note twice, and the second push is refused by the
   * server as stale, which reads as a sync that keeps failing.
   */
  it("hands back the one already running rather than starting another", async () => {
    const sync = fakeSync({ key: vi.fn(async () => new Uint8Array(32)) })

    await startDesktopSync()
    const second = await startDesktopSync()

    // The second returns nothing because the first is still going, and the
    // key is never asked for twice.
    expect(second).toBeNull()
    expect(sync.key).toHaveBeenCalledOnce()
    stopDesktopSync()
  })

  it("says whether one is going, and stops saying so once it is stopped", async () => {
    fakeSync({ key: vi.fn(async () => new Uint8Array(32)) })

    await startDesktopSync()
    expect(isRunning()).toBe(true)

    stopDesktopSync()
    expect(isRunning()).toBe(false)
  })

  it("can be started again after being stopped", async () => {
    const sync = fakeSync({ key: vi.fn(async () => new Uint8Array(32)) })

    await startDesktopSync()
    stopDesktopSync()
    await startDesktopSync()

    expect(sync.key).toHaveBeenCalledTimes(2)
    stopDesktopSync()
  })
})

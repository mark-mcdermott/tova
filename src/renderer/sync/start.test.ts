import { describe, it, expect, vi, beforeEach } from "vitest"
import { startDesktopSync } from "./start"
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

beforeEach(() => void vi.restoreAllMocks())

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

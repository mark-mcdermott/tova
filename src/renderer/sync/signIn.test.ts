import { describe, it, expect, vi, beforeEach } from "vitest"
import { desktopSignIn } from "./signIn"
import { prepareVault } from "../../shared/vaultSetup"
import type { TovaBridge } from "../../shared/types"

const EMAIL = "mark@markmcdermott.io"
const PASSWORD = "a long enough password to be worth having"

/** A desktop backend with only the methods a sign-in touches. */
function fakeSync(over: Partial<TovaBridge["sync"]> = {}) {
  const sync = {
    signIn: vi.fn(async () => undefined),
    envelopes: vi.fn(async () => ({ envelopes: [] })),
    setKey: vi.fn(async () => undefined),
    ...over
  } as unknown as TovaBridge["sync"]

  window.tova = { sync } as unknown as TovaBridge
  return sync
}

beforeEach(() => void vi.restoreAllMocks())

describe("signing in on the desktop", () => {
  it("unwraps the key and hands it to the backend", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)
    const sync = fakeSync({
      envelopes: vi.fn(async () => ({
        envelopes: [
          { kind: "password", epoch: 1, ...vault.envelopes.password },
          { kind: "recovery", epoch: 1, ...vault.envelopes.recovery }
        ]
      }))
    })

    expect(await desktopSignIn(EMAIL, PASSWORD)).toBe("unlocked")
    expect(sync.setKey).toHaveBeenCalledWith(vault.contentKey)
  })

  /*
   * The credential proves who somebody is and opens nothing. What travels is
   * the auth secret — one half of a split whose other half never leaves this
   * machine — and a password reaching the backend would be the whole point of
   * the split lost.
   */
  it("sends the auth secret, never the password", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)
    const sync = fakeSync({
      envelopes: vi.fn(async () => ({
        envelopes: [
          { kind: "password", epoch: 1, ...vault.envelopes.password },
          { kind: "recovery", epoch: 1, ...vault.envelopes.recovery }
        ]
      }))
    })

    await desktopSignIn(EMAIL, PASSWORD)

    expect(sync.signIn).toHaveBeenCalledWith(EMAIL, vault.authSecret)
    expect(JSON.stringify(vi.mocked(sync.signIn).mock.calls)).not.toContain(PASSWORD)
  })

  /*
   * Signed in, and the envelope does not open: the password changed without it
   * following, which is what a reset does. A state with a screen behind it,
   * not an error.
   */
  it("reports a vault the password no longer opens", async () => {
    const vault = await prepareVault(EMAIL, "what it used to be")
    const sync = fakeSync({
      envelopes: vi.fn(async () => ({
        envelopes: [
          { kind: "password", epoch: 1, ...vault.envelopes.password },
          { kind: "recovery", epoch: 1, ...vault.envelopes.recovery }
        ]
      }))
    })

    expect(await desktopSignIn(EMAIL, PASSWORD)).toBe("locked")
    expect(sync.setKey).not.toHaveBeenCalled()
  })

  it("reports an account whose keys were never stored", async () => {
    const sync = fakeSync()

    expect(await desktopSignIn(EMAIL, PASSWORD)).toBe("no vault")
    expect(sync.setKey).not.toHaveBeenCalled()
  })

  /*
   * Starting fresh leaves the old epoch in place, so a key found later still
   * opens the notes it was made for. The newest complete pair is the one to
   * sign in with.
   */
  it("opens the newest epoch when there is more than one", async () => {
    const old = await prepareVault(EMAIL, PASSWORD)
    const fresh = await prepareVault(EMAIL, PASSWORD)
    const sync = fakeSync({
      envelopes: vi.fn(async () => ({
        envelopes: [
          { kind: "password", epoch: 1, ...old.envelopes.password },
          { kind: "recovery", epoch: 1, ...old.envelopes.recovery },
          { kind: "password", epoch: 2, ...fresh.envelopes.password },
          { kind: "recovery", epoch: 2, ...fresh.envelopes.recovery }
        ]
      }))
    })

    await desktopSignIn(EMAIL, PASSWORD)

    expect(sync.setKey).toHaveBeenCalledWith(fresh.contentKey)
  })
})

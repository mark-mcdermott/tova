import { describe, it, expect, vi, beforeEach } from "vitest"
import { startIfPossible } from "./startup"
import { signal } from "../../src/shared/signal"

/*
 * The whole module, because `noteStore` calls `database()` as it loads — a
 * partial mock leaves that call reaching for an export that is not there, and
 * the file fails to collect rather than failing a test.
 */
vi.mock("./idb", () => ({
  available: () => true,
  database: () => ({ run: async () => undefined, forget: async () => undefined })
}))
vi.mock("./keyStore", () => ({ recall: vi.fn(async () => null) }))
vi.mock("./credentials", () => ({ signedInAs: vi.fn(async () => null) }))

const { recall } = await import("./keyStore")
const { signedInAs } = await import("./credentials")

beforeEach(() => void vi.clearAllMocks())

describe("when a browser cannot sync", () => {
  /*
   * Nobody has signed in. Tova as it has always been, and nothing to report —
   * saying "not syncing" to somebody who never asked for it would be noise.
   */
  it("says nothing when there is no account", async () => {
    vi.mocked(recall).mockResolvedValue(null)
    vi.mocked(signedInAs).mockResolvedValue(null)

    const started = await startIfPossible(signal(), signal())

    expect(started).toEqual({ state: "local only", because: "signed out" })
  })

  /*
   * Signed in, no key. Everything looks like it works and nothing reaches the
   * other devices — the one state worth interrupting for.
   */
  it("says so when somebody signed in and the key did not come with them", async () => {
    vi.mocked(recall).mockResolvedValue(null)
    vi.mocked(signedInAs).mockResolvedValue("mark@markmcdermott.io")

    const started = await startIfPossible(signal(), signal())

    expect(started).toEqual({ state: "local only", because: "locked" })
  })

  it("treats a server it cannot ask as signed out rather than throwing", async () => {
    vi.mocked(recall).mockResolvedValue(null)
    vi.mocked(signedInAs).mockRejectedValue(new Error("offline"))

    await expect(startIfPossible(signal(), signal())).resolves.toEqual({
      state: "local only",
      because: "signed out"
    })
  })
})

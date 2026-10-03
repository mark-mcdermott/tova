import { describe, it, expect, vi } from "vitest"
import { forgetThisDevice } from "./forget"

describe("forgetting this device", () => {
  it("clears both the notes and the key", async () => {
    const notes = vi.fn(async () => undefined)
    const key = vi.fn(async () => undefined)

    await forgetThisDevice(notes, key)

    expect(notes).toHaveBeenCalled()
    expect(key).toHaveBeenCalled()
  })

  /*
   * The notes are plaintext in IndexedDB, because they are what the reader is
   * here to see. So a half-done forget that kept the key is a key with nothing
   * to open, and a half-done forget that kept the notes is readable writing
   * with no lock in front of it. Only one of those is survivable.
   */
  it("clears the notes first, so a failure leaves a key and not the writing", async () => {
    const order: string[] = []
    const notes = vi.fn(async () => void order.push("notes"))
    const key = vi.fn(async () => void order.push("key"))

    await forgetThisDevice(notes, key)

    expect(order).toEqual(["notes", "key"])
  })

  it("does not drop the key when the notes would not go", async () => {
    const key = vi.fn(async () => undefined)

    await expect(
      forgetThisDevice(async () => {
        throw new Error("the database would not go")
      }, key)
    ).rejects.toThrow()
    expect(key).not.toHaveBeenCalled()
  })
})

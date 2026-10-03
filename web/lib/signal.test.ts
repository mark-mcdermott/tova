import { describe, it, expect, vi } from "vitest"
import { signal } from "./signal"

describe("a signal", () => {
  it("tells everyone listening", () => {
    const one = vi.fn()
    const two = vi.fn()
    const it_ = signal()
    it_.listen(one)
    it_.listen(two)

    it_.announce()

    expect(one).toHaveBeenCalledOnce()
    expect(two).toHaveBeenCalledOnce()
  })

  it("stops telling somebody who stopped listening", () => {
    const listener = vi.fn()
    const it_ = signal()
    const stop = it_.listen(listener)

    stop()
    it_.announce()

    expect(listener).not.toHaveBeenCalled()
  })

  it("survives a listener that unsubscribes itself mid-announcement", () => {
    const after = vi.fn()
    const it_ = signal()
    const stop = it_.listen(() => stop())
    it_.listen(after)

    it_.announce()

    expect(after).toHaveBeenCalledOnce()
  })

  /*
   * The case the copy is actually for. A `Set` copes with a listener removing
   * itself; walking it live would call one *added* during the announcement in
   * that same round, and a listener that adds a listener would never finish.
   */
  it("tells the listeners there were when it started, not the ones added since", () => {
    const late = vi.fn()
    const it_ = signal()
    it_.listen(() => void it_.listen(late))

    it_.announce()

    expect(late).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { startSync } from "./syncRunner"
import { signal } from "./signal"

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

const settled = () => vi.advanceTimersByTimeAsync(0)

describe("when a sync happens", () => {
  it("runs shortly after this tab writes something", async () => {
    const run = vi.fn(async () => undefined)
    const localChanged = signal()
    startSync({ run, localChanged, settle: 100 })

    localChanged.announce()
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)
  })

  /*
   * A burst of typing is one sync, not one per keystroke. Each change pushes
   * the wait out again, so the sync lands after somebody stops rather than
   * during.
   */
  it("makes one sync out of a burst of changes", async () => {
    const run = vi.fn(async () => undefined)
    const localChanged = signal()
    startSync({ run, localChanged, settle: 100 })

    for (let at = 0; at < 5; at += 1) {
      localChanged.announce()
      await vi.advanceTimersByTimeAsync(50)
    }
    await vi.advanceTimersByTimeAsync(100)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it("keeps going on its own when nothing is happening", async () => {
    const run = vi.fn(async () => undefined)
    startSync({ run, localChanged: signal(), settle: 10, idle: 1_000 })

    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(run).toHaveBeenCalledTimes(4)
  })
})

describe("never two at once", () => {
  it("does not start a second while one is going", async () => {
    let release: () => void = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => void (release = resolve)))
    const runner = startSync({ run, localChanged: signal(), settle: 10 })

    await vi.advanceTimersByTimeAsync(10)
    void runner.now()
    void runner.now()

    expect(run).toHaveBeenCalledTimes(1)
    release()
  })

  /*
   * The run in flight read the store before the change existed, so it has to
   * go round again — otherwise an edit made mid-sync waits for the idle timer,
   * which is a minute of a note looking unsaved to the other device.
   */
  it("goes round again when something changed mid-sync", async () => {
    let release: () => void = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => void (release = resolve)))
    const localChanged = signal()
    startSync({ run, localChanged, settle: 10 })

    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1)

    localChanged.announce()
    await vi.advanceTimersByTimeAsync(10)
    release()
    await settled()

    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe("when a sync fails", () => {
  it("keeps the loop alive and says what went wrong", async () => {
    const onError = vi.fn()
    const run = vi.fn(async () => {
      throw new Error("offline")
    })
    startSync({ run, localChanged: signal(), settle: 10, idle: 100, onError })

    await vi.advanceTimersByTimeAsync(10)

    expect(onError).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(run.mock.calls.length).toBeGreaterThan(1)
  })

  /*
   * A server that is down should be asked less often, not once a minute
   * forever. Doubling means a long outage costs a handful of requests rather
   * than one a minute for its duration.
   */
  it("asks less often the longer it keeps failing", async () => {
    const run = vi.fn(async () => {
      throw new Error("offline")
    })
    startSync({ run, localChanged: signal(), settle: 10, idle: 100, backOff: 10_000 })

    await vi.advanceTimersByTimeAsync(10)
    const afterFirst = run.mock.calls.length

    await vi.advanceTimersByTimeAsync(150)
    expect(run.mock.calls.length).toBe(afterFirst)

    await vi.advanceTimersByTimeAsync(300)
    expect(run.mock.calls.length).toBe(afterFirst + 1)
  })

  it("forgets the whole history after one success", async () => {
    let fail = true
    const run = vi.fn(async () => {
      if (fail) throw new Error("offline")
    })
    startSync({ run, localChanged: signal(), settle: 10, idle: 100 })

    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(400)
    fail = false
    await vi.advanceTimersByTimeAsync(2_000)

    const before = run.mock.calls.length
    await vi.advanceTimersByTimeAsync(100)
    expect(run.mock.calls.length).toBe(before + 1)
  })
})

describe("stopping", () => {
  /*
   * Stopped during a run, which is the case the flag is for. Clearing the
   * timer is not enough: the run in flight schedules the next one when it
   * finishes, and a runner that kept going after being stopped would keep
   * going for the life of the tab.
   */
  it("schedules nothing when the run in flight finishes", async () => {
    let release: () => void = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => void (release = resolve)))
    const runner = startSync({ run, localChanged: signal(), settle: 10, idle: 100 })

    await vi.advanceTimersByTimeAsync(10)
    runner.stop()
    release()
    await settled()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("runs nothing more, and not on a change either", async () => {
    const run = vi.fn(async () => undefined)
    const localChanged = signal()
    const runner = startSync({ run, localChanged, settle: 10, idle: 100 })

    await vi.advanceTimersByTimeAsync(10)
    runner.stop()

    localChanged.announce()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(run).toHaveBeenCalledTimes(1)
  })
})

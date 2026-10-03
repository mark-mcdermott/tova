/**
 * When a sync happens, which is the only thing this decides.
 *
 * `syncOnce` is what a sync *is*. This is the part that answers: now, in a
 * moment because somebody typed, or in a while because time passed — and never
 * two at once.
 *
 * Nothing here knows about keys, notes or HTTP. It is given something to run
 * and something to listen to, so the awkward parts — not overlapping, not
 * hammering a server that is refusing, not losing a change that arrived while
 * a sync was already going — are decided by a function that can be read.
 */

import type { Signal } from "./signal"

export interface Runner {
  /** Runs one now, unless one is already going. Resolves when it settles. */
  now: () => Promise<void>
  stop: () => void
}

export interface RunnerOptions {
  run: () => Promise<unknown>
  /** This tab wrote something. A sync follows shortly. */
  localChanged: Signal
  /** How long to wait after a change, so a burst of typing is one sync. */
  settle?: number
  /** How long between syncs when nothing is happening. */
  idle?: number
  /** Longest wait after a run that threw. Doubles up to this. */
  backOff?: number
  /** Called when a run throws, so a status line can say so. */
  onError?: (error: unknown) => void
}

const SETTLE = 2_000
const IDLE = 60_000
const BACK_OFF = 5 * 60_000

export function startSync({
  run,
  localChanged,
  settle = SETTLE,
  idle = IDLE,
  backOff = BACK_OFF,
  onError
}: RunnerOptions): Runner {
  let going = false
  let again = false
  let stopped = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const wait = (ms: number) => {
    if (timer !== null) clearTimeout(timer)
    timer = stopped ? null : setTimeout(() => void once(), ms)
  }

  /**
   * How long until the next one.
   *
   * Doubling after a failure, so a server that is down is asked once a minute
   * and then less, rather than once a minute forever. One success forgets the
   * whole history — the thing that was wrong is over.
   */
  const next = () => (failures === 0 ? idle : Math.min(idle * 2 ** failures, backOff))

  async function once(): Promise<void> {
    if (stopped) return
    if (going) {
      // Something changed mid-sync. The run in flight read the store before
      // that change existed, so it has to go round again or the change waits
      // for the idle timer.
      again = true
      return
    }

    going = true
    try {
      await run()
      failures = 0
    } catch (error) {
      failures += 1
      onError?.(error)
    } finally {
      going = false
    }

    if (again) {
      again = false
      return once()
    }
    wait(next())
  }

  const unlisten = localChanged.listen(() => wait(settle))
  wait(settle)

  return {
    now: once,
    stop() {
      stopped = true
      unlisten()
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}

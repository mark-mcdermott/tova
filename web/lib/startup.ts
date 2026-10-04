/**
 * Turning on sync, when there is anything to turn it on with.
 *
 * Three things have to be true: a session, a content key this device is
 * holding, and a browser that can store notes. Any of them missing is not an
 * error — it is Tova working locally, which is what it does on a device nobody
 * has signed in on. So this reports what it did rather than throwing.
 *
 * The runner is what decides *when*; `syncOnce` is what a sync is. This is
 * only the part that knows where the pieces live.
 */

import { syncOnce } from "../../src/shared/syncCycle"
import { available } from "./idb"
import { signedInAs } from "./credentials"
import { recall } from "./keyStore"
import { webNoteStore } from "./noteStore"
import type { Signal } from "../../src/shared/signal"
import { register } from "../../src/shared/runningSync"
import { startSync, type Runner } from "../../src/shared/syncRunner"
import { webTransport } from "./transport"

export type Started =
  | { state: "syncing"; runner: Runner }
  /**
   * Working, and only here. The reason matters, because two of them mean
   * different things to the reader.
   *
   * `signed out` is Tova as it has always been and needs no telling. `locked`
   * is somebody who signed in, expects their notes to travel, and has no idea
   * they do not — which is the one that has to be said out loud.
   */
  | { state: "local only"; because: "signed out" | "locked" | "no storage" }

export async function startIfPossible(
  localChanged: Signal,
  vaultChanged: Signal,
  onError?: (error: unknown) => void
): Promise<Started> {
  if (!available()) return { state: "local only", because: "no storage" }

  const held = await recall()
  if (held === null) {
    /*
     * No key on this device. Which of two things that is depends on whether
     * there is an account at all, and the difference is the whole of what the
     * reader needs to know: signed out is nothing to report, and signed in
     * without a key is sync quietly not happening.
     */
    const signedIn = await signedInAs().catch(() => null)
    return { state: "local only", because: signedIn === null ? "signed out" : "locked" }
  }

  const store = webNoteStore()
  const transport = webTransport()

  const runner = startSync({
    localChanged,
    onError,
    async run() {
      const report = await syncOnce(store, transport, held.key)
      /*
       * Only when something arrived. Announcing after every sync would reload
       * the renderer's list once a minute forever, including while somebody is
       * typing into it.
       */
      if (report.taken.length + report.merged.length + report.copied.length > 0) {
        vaultChanged.announce()
      }
    }
  })

  /*
   * Registered, so a screen can ask whether a sync is going and hurry one
   * along without knowing which host started it. The desktop registers the
   * same way from `main.tsx`.
   */
  register({ now: () => runner.now(), stop: () => runner.stop() })
  return { state: "syncing", runner }
}

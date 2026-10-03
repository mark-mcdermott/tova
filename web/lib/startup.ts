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
import { recall } from "./keyStore"
import { webNoteStore } from "./noteStore"
import type { Signal } from "./signal"
import { startSync, type Runner } from "./syncRunner"
import { webTransport } from "./transport"

export type Started =
  | { state: "syncing"; runner: Runner }
  /** Working, and only here. The reason is for a status line, not a dialog. */
  | { state: "local only"; because: "no key" | "no storage" }

export async function startIfPossible(
  localChanged: Signal,
  vaultChanged: Signal,
  onError?: (error: unknown) => void
): Promise<Started> {
  if (!available()) return { state: "local only", because: "no storage" }

  const held = await recall()
  if (held === null) return { state: "local only", because: "no key" }

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

  return { state: "syncing", runner }
}

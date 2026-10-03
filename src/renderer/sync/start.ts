/**
 * Turning on sync on the desktop.
 *
 * The web's equivalent is `web/lib/startup.ts`, and the two differ in exactly
 * the places the backends do: where the notes are, where the key is, and how a
 * request reaches the server. What they share is everything that decides
 * anything — `syncCycle`, `notePlan`, `merge` and `syncRunner`.
 *
 * Started from `main.tsx` rather than from `App`, deliberately. `App` is
 * mounted by both backends, and a sync started there would start twice on the
 * web — once here and once in `Shell`.
 */

import { syncOnce } from "../../shared/syncCycle"
import { signal, type Signal } from "../../shared/signal"
import { startSync, type Runner } from "../../shared/syncRunner"
import type { SyncTransport } from "../../shared/syncTransport"
import { pullResponse, pushResponse } from "../../shared/sync"
import { bridgeNoteStore } from "./bridgeStore"

/**
 * The two calls, over the bridge.
 *
 * Parsed here rather than trusted, for the reason the web's transport parses:
 * `bigint` has no JSON, so a version arrives as a string and the schema is
 * what turns it back. One used as a string would compare wrongly and silently.
 */
function bridgeTransport(): SyncTransport {
  return {
    async pull(cursor, limit) {
      return pullResponse.parse(await window.tova.sync.pull(String(cursor), limit))
    },
    async push(notes) {
      const going = notes.map((note) => ({
        ...note,
        baseVersion: note.baseVersion === null ? null : String(note.baseVersion)
      }))
      return pushResponse.parse(await window.tova.sync.push(going)).results
    }
  }
}

export interface DesktopSync {
  runner: Runner
  /** Told after every local write, so a sync follows shortly. */
  localChanged: Signal
}

/**
 * Starts one, or does not.
 *
 * Both of its conditions are ordinary states rather than failures: no account,
 * and no key on this device. Either way Tova is what it has always been — a
 * folder of markdown on one Mac — and that is what it stays until somebody
 * signs in. Nothing is reported, because there is nothing wrong.
 */
export async function startDesktopSync(): Promise<DesktopSync | null> {
  const [account, key] = await Promise.all([window.tova.sync.account(), window.tova.sync.key()])
  if (account === null || key === null) return null

  const store = bridgeNoteStore(window.tova)
  const transport = bridgeTransport()
  const localChanged = signal()

  const runner = startSync({
    localChanged,
    run: () => syncOnce(store, transport, key)
  })

  return { runner, localChanged }
}

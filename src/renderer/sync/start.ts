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
 * Starts one, or does not. Never throws.
 *
 * The key is asked for first, and it is the only question asked before a
 * decision: it is answered from this Mac's keychain, with no connection
 * opened. A Mac nobody has signed in on reaches the network **not once** at
 * launch, which is what "Tova opens no connection at all" has to mean to stay
 * true.
 *
 * Having a key is enough to start. Whether the server is reachable is not
 * worth asking — the runner finds out, backs off, and tries again, which is
 * what being on a train is. Asking first would turn a laptop opened offline
 * into an error at launch, and an unhandled one: this is called without being
 * awaited, because a vault opens at the speed of a folder.
 */
export async function startDesktopSync(): Promise<DesktopSync | null> {
  const key = await window.tova.sync.key().catch(() => null)
  if (key === null) return null

  const store = bridgeNoteStore(window.tova)
  const transport = bridgeTransport()
  const localChanged = signal()

  const runner = startSync({
    localChanged,
    run: () => syncOnce(store, transport, key)
  })

  return { runner, localChanged }
}

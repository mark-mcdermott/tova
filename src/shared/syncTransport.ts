/**
 * The two calls, as the cycle wants them.
 *
 * An interface rather than a `fetch` so the cycle can be tested without a
 * server — it is the decisions that are worth testing, and a test that needed
 * a Neon database would be testing Neon. `web/lib/transport.ts` is the real
 * one.
 */

import type { PullResponse, PushResult, PushedNote } from "./sync"

export interface SyncTransport {
  pull(cursor: bigint, limit?: number): Promise<PullResponse>
  push(notes: PushedNote[]): Promise<PushResult[]>
}

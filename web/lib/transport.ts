/**
 * The two sync calls over HTTP.
 *
 * The only file on the web side that knows the endpoints exist. Everything a
 * sync decides is in `src/shared`, written against the interface rather than
 * against fetch, so it can be tested without a server.
 *
 * `bigint` does not survive JSON, so versions travel as strings and the Zod
 * schemas coerce them back. That is why the responses are parsed here rather
 * than cast: a version that arrived as a string and was used as one would
 * compare wrongly and silently.
 */

import {
  pullResponse,
  pushResponse,
  type PullResponse,
  type PushResult,
  type PushedNote
} from "../../src/shared/sync"
import type { SyncTransport } from "../../src/shared/syncTransport"

const NOTES = "/api/vault/notes"

async function refuse(response: Response): Promise<never> {
  throw new Error(`The server said ${response.status}`)
}

export function webTransport(fetch: typeof globalThis.fetch = globalThis.fetch): SyncTransport {
  return {
    async pull(cursor, limit) {
      const query = new URLSearchParams({ cursor: String(cursor) })
      if (limit !== undefined) query.set("limit", String(limit))

      const response = await fetch(`${NOTES}?${query}`, { credentials: "same-origin" })
      if (!response.ok) await refuse(response)

      return pullResponse.parse(await response.json()) satisfies PullResponse
    },

    async push(notes: PushedNote[]) {
      const response = await fetch(NOTES, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        // `bigint` has no JSON, so a base version goes up as a string and the
        // endpoint's schema coerces it back.
        body: JSON.stringify({
          notes: notes.map((note) => ({
            ...note,
            baseVersion: note.baseVersion === null ? null : String(note.baseVersion)
          }))
        })
      })
      if (!response.ok) await refuse(response)

      return pushResponse.parse(await response.json()).results satisfies PushResult[]
    }
  }
}

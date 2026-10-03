/**
 * The web's half of `SyncApi`.
 *
 * Better Auth's browser client and `fetch`, because the page is already on the
 * right origin — the session cookie rides along on its own and there is no
 * CORS to answer. The desktop's half goes out through Rust for the opposite
 * reason, and `src-tauri/src/account.rs` says which.
 *
 * What comes back is the server's JSON untouched. `src/shared/sync.ts` gives
 * it a shape, and it does that for both backends.
 */

import type { SyncApi } from "../../../src/shared/types"
import { credentials, signedInAs, signOut as endSession } from "../credentials"

const NOTES = "/api/vault/notes"

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`The server said ${response.status}`)
  return response.json()
}

export function webSync(fetch: typeof globalThis.fetch = globalThis.fetch): SyncApi {
  return {
    account: () => signedInAs(),

    /*
     * The auth secret, not a password — the same thing the desktop sends, and
     * the same thing the sign-in form sends. Which half of the password split
     * travels is a property of the split rather than of the client.
     */
    signIn: (email, secret) => credentials.signIn(email, secret),
    signOut: () => endSession(),

    async pull(cursor, limit) {
      const query = new URLSearchParams({ cursor })
      if (limit !== undefined) query.set("limit", String(limit))

      return json(await fetch(`${NOTES}?${query}`, { credentials: "same-origin" }))
    },

    async push(notes) {
      return json(
        await fetch(NOTES, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ notes })
        })
      )
    }
  }
}

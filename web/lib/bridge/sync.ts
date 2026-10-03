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
import { readSyncState, writeSyncState } from "../noteStore"
import { forget, keepIfPossible, recall } from "../keyStore"

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

    /*
     * Kept in the notes database, so "forget this device" clears it with
     * everything else — a cursor left behind would be a cursor past notes this
     * browser no longer has.
     *
     * The web's own sync does not read these: `Shell.tsx` builds a store
     * directly rather than through the bridge, and that store keeps its cursor
     * in the same place. The desktop does go through here, which is why the
     * interface has them. Worth unifying the day one path is enough.
     */
    state: async () => (await readSyncState()) ?? null,
    setState: (value) => writeSyncState(value),

    /*
     * A `CryptoKey`, not bytes. A browser can hold one script may use and may
     * not read out, which is better than anything a Mac can offer — and the
     * desktop's answer is bytes from the keychain, which is the best a Mac
     * can. `seal` and `unseal` take either.
     */
    key: async () => (await recall())?.key ?? null,
    async setKey(key) {
      if (key === null) return forget()
      await keepIfPossible({ contentKey: key as Uint8Array<ArrayBuffer>, epoch: 1 })
    },

    async envelopes() {
      return json(await fetch("/api/vault/envelopes", { credentials: "same-origin" }))
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

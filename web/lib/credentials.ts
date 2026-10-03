/**
 * The `Credentials` port, over Better Auth's browser client.
 *
 * The only file that knows Better Auth exists on the client side. The flows in
 * `src/shared/vaultClient.ts` are written against the interface so they can be
 * tested without a server; this is the half that cannot be.
 *
 * What is handed over is never a password. It is the auth secret from
 * `deriveAccountKeys` — the half of the password split that is allowed to
 * travel, and already the output of scrypt by the time it gets here.
 */

import { createAuthClient } from "better-auth/client"
import type { Credentials } from "../../src/shared/vaultClient"

const auth = createAuthClient()

/**
 * Better Auth answers with `{ data, error }` rather than throwing.
 *
 * Unwrapped here so a failure is a rejected promise like every other failure
 * in the flows, instead of a shape every caller has to remember to inspect —
 * a forgotten check would read as a password change that worked.
 */
function orThrow(result: { error?: { message?: string } | null }): void {
  if (result.error) throw new Error(result.error.message ?? "That did not work")
}

export const credentials: Credentials = {
  async signUp(email, secret, name) {
    orThrow(await auth.signUp.email({ email, password: secret, name }))
  },

  async signIn(email, secret) {
    orThrow(await auth.signIn.email({ email, password: secret }))
  },

  async changeSecret(current, next) {
    /*
     * Other sessions are revoked, because the point of changing a password is
     * usually that somebody else might have had it. The envelope those
     * sessions were holding keeps working — a session is an auth question and
     * cannot reach back to lock a key a device has already unwrapped, which
     * `docs/SYNC.md` says plainly and this is the place it shows.
     */
    orThrow(
      await auth.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true
      })
    )
  }
}

/**
 * The email this browser is signed in as, or null.
 *
 * Asked of the server rather than read from a cookie, because the cookie is
 * `HttpOnly` and because a session can end on the server while a browser still
 * holds the crumb of one.
 */
export async function signedInAs(): Promise<string | null> {
  const { data } = await auth.getSession()
  return data?.user.email ?? null
}

/** Ends the session on this device. The key, if one is kept, is a separate thing. */
export async function signOut(): Promise<void> {
  orThrow(await auth.signOut())
}

/**
 * Signing in on the desktop, and unwrapping the key that follows.
 *
 * The crypto is the shared crypto and the decisions are the shared decisions —
 * `vaultClient.ts` does the same three steps for the web. What differs is only
 * where the request goes, which is the bridge's business and not this file's.
 *
 * No sign-up here. An account is made at tova.so, where the recovery key can
 * be shown on a screen built to show it once and never again — and building a
 * second one of those is how two of them come to disagree about the most
 * consequential moment in the product.
 */

import { currentEpoch, envelopeFor, envelopesResponse } from "../../shared/envelopes"
import { authSecretFor, unlockWithPassword } from "../../shared/vaultSetup"

export type SignedIn =
  | "unlocked"
  /** Signed in, and the password does not open the vault. A reset, usually. */
  | "locked"
  /** Signed in, and there is nothing stored. A signup that stopped halfway. */
  | "no vault"

/**
 * Three steps, and the middle one is the reason the first cannot be enough.
 *
 * The credential proves who somebody is. It does not open anything: the key is
 * sealed under a password this server has never held, so the envelope has to
 * come back and be opened here.
 */
export async function desktopSignIn(email: string, password: string): Promise<SignedIn> {
  await window.tova.sync.signIn(email, await authSecretFor(email, password))

  const { envelopes } = envelopesResponse.parse(await window.tova.sync.envelopes())
  const epoch = currentEpoch(envelopes)
  if (epoch === null) return "no vault"

  const sealed = envelopeFor(envelopes, "password", epoch)
  if (sealed === null) return "locked"

  try {
    await window.tova.sync.setKey(await unlockWithPassword(password, sealed))
  } catch {
    /*
     * The credential was right and the envelope did not open, so the password
     * changed without the envelope following — a reset. Not an error: a state,
     * with a way out that lives on the web for now.
     */
    return "locked"
  }

  return "unlocked"
}

/** Ends the session and takes the key with it. */
export async function desktopSignOut(): Promise<void> {
  await window.tova.sync.signOut()
}

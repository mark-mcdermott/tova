/**
 * Making a vault, and getting back into one.
 *
 * The orchestration the signup and sign-in screens call. Everything here runs
 * on the device: the password is turned into two halves, a content key is
 * minted, and what leaves is an auth secret and two sealed envelopes. No key
 * and no password ever travel.
 *
 * `docs/SYNC.md` is the model. `accountKeys.ts` is the split, `crypto.ts` is
 * the envelope.
 */

import { deriveAccountKeys, newContentKey, unwrapContentKey, wrapContentKey } from "./accountKeys"
import { newRecoveryKey, recoveryKeyToCipherKey } from "./crypto"

/** What a sealed content key and its factor's salt look like going up. */
export type SealedFactor = { salt: string; envelope: string }

export type NewVault = {
  /** Sent to Better Auth in place of the password. */
  authSecret: string
  /**
   * Shown once and never again. Not derived from anything, so there is nothing
   * to recompute it from — which is the whole reason the screen that shows it
   * cannot be added later.
   */
  recoveryKey: string
  envelopes: { password: SealedFactor; recovery: SealedFactor }
  /** Held in memory to open notes with; never sent. */
  contentKey: Uint8Array<ArrayBuffer>
}

const encode = (text: string) => new TextEncoder().encode(text)
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>

/**
 * The salt a password's wrapping key is derived with.
 *
 * The email, and it is stored alongside the envelope rather than merely
 * recomputed. The derivation has to work before anyone is signed in, so the
 * salt has to be something the device already knows — and a per-account random
 * one would have to be fetched first, from an endpoint that would then confirm
 * which emails have accounts.
 *
 * Storing it means a changed email is detectable rather than silent: the
 * envelope still names the address it was sealed under, so a client can say
 * "re-wrap this" instead of deriving a key that opens nothing. Changing an
 * email is a password change in every respect that matters here.
 */
function passwordSalt(email: string): string {
  return toBase64(encode(email.trim().toLowerCase()))
}

/**
 * Everything a new vault needs, made here and never anywhere else.
 *
 * Both envelopes at once, because an account with one factor is an account with
 * no way back.
 */
export async function prepareVault(email: string, password: string): Promise<NewVault> {
  const { authSecret, wrappingKey } = await deriveAccountKeys(email, password)
  const contentKey = newContentKey()

  const recoveryKey = newRecoveryKey()
  const recoverySalt = crypto.getRandomValues(new Uint8Array(16))
  const recoveryWrapping = recoveryKeyToCipherKey(recoveryKey, recoverySalt)

  const [byPassword, byRecovery] = await Promise.all([
    wrapContentKey(contentKey, wrappingKey),
    wrapContentKey(contentKey, recoveryWrapping)
  ])

  return {
    authSecret,
    recoveryKey,
    contentKey,
    envelopes: {
      password: { salt: passwordSalt(email), envelope: byPassword },
      recovery: { salt: toBase64(recoverySalt), envelope: byRecovery }
    }
  }
}

/** The auth secret alone, for signing in without touching any envelope. */
export async function authSecretFor(email: string, password: string): Promise<string> {
  return (await deriveAccountKeys(email, password)).authSecret
}

/**
 * Opens a vault with the password, or throws.
 *
 * `salt` comes from the stored envelope rather than from the email on screen.
 * They are normally the same; when they are not, the address changed after the
 * envelope was sealed and deriving from the new one would produce a key that
 * opens nothing — a failure that reads as a wrong password.
 */
export async function unlockWithPassword(
  password: string,
  factor: SealedFactor
): Promise<Uint8Array<ArrayBuffer>> {
  const sealedUnder = new TextDecoder().decode(fromBase64(factor.salt))
  const { wrappingKey } = await deriveAccountKeys(sealedUnder, password)
  return unwrapContentKey(factor.envelope, wrappingKey)
}

/**
 * Opens a vault with the recovery key, or throws.
 *
 * The way back after a password reset, and the only one. Entry is forgiving —
 * case and dashes are stripped — because this is read off paper.
 */
export async function unlockWithRecoveryKey(
  recoveryKey: string,
  factor: SealedFactor
): Promise<Uint8Array<ArrayBuffer>> {
  const wrapping = recoveryKeyToCipherKey(recoveryKey, fromBase64(factor.salt))
  return unwrapContentKey(factor.envelope, wrapping)
}

/**
 * Seals the same content key under a new password.
 *
 * What a password change and a post-reset recovery both end in. The content key
 * is unchanged, so no note is re-encrypted and the recovery envelope is left
 * exactly as it was.
 */
export async function reWrapForPassword(
  email: string,
  password: string,
  contentKey: Uint8Array<ArrayBuffer>
): Promise<{ authSecret: string; factor: SealedFactor }> {
  const { authSecret, wrappingKey } = await deriveAccountKeys(email, password)
  return {
    authSecret,
    factor: { salt: passwordSalt(email), envelope: await wrapContentKey(contentKey, wrappingKey) }
  }
}

/**
 * A fresh recovery key over the same content key.
 *
 * Returns the key to show once and the envelope to store. Notes are untouched;
 * only the recovery row is replaced.
 */
export async function replaceRecoveryKey(
  contentKey: Uint8Array<ArrayBuffer>
): Promise<{ recoveryKey: string; factor: SealedFactor }> {
  const recoveryKey = newRecoveryKey()
  const salt = crypto.getRandomValues(new Uint8Array(16))

  return {
    recoveryKey,
    factor: {
      salt: toBase64(salt),
      envelope: await wrapContentKey(contentKey, recoveryKeyToCipherKey(recoveryKey, salt))
    }
  }
}

/**
 * Turning a password into two things that must never be the same thing.
 *
 * Email and password sign you in *and* unwrap your notes, which is the whole
 * reason that pair was chosen over a magic link. The danger in it is obvious
 * once stated: if the server sees the password, the server can derive the key
 * that decrypts everything, and "end to end encrypted" becomes a promise about
 * restraint rather than a property of the system.
 *
 * So the password never leaves the device. One expensive derivation produces a
 * master secret, and two cheap ones split it:
 *
 *   master       = scrypt(password, email)
 *   authSecret   = HKDF(master, "auth")   → sent, and all the server ever sees
 *   wrappingKey  = HKDF(master, "wrap")   → stays here, unwraps the content key
 *
 * HKDF is one way, so holding `authSecret` gives no route back to `master` and
 * none onward to `wrappingKey`. The server stores a hash of something that was
 * already a hash, and can check a password it has never been told.
 *
 * The content key itself is independent of all of it — 32 random bytes, sealed
 * once per factor. That is what lets a password change re-wrap one small
 * envelope instead of re-encrypting every note, and what makes the recovery key
 * a second door rather than a lesser one. `docs/SYNC.md` has the model.
 */

import { scrypt } from "@noble/hashes/scrypt.js"
import { KEY_BYTES, seal, unseal } from "./crypto"

/** The parameters the Rust already uses, and `conformance/crypto.json` pins. */
const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 32 }

/**
 * What the two halves are derived for, mixed into HKDF so they cannot collide.
 *
 * Versioned, because changing a derivation silently would lock every account
 * out rather than fail: the auth secret would stop matching and the wrapping
 * key would stop unwrapping, both at once and with no message saying why.
 */
const AUTH_INFO = "tova/v1/auth"
const WRAP_INFO = "tova/v1/wrap"

export type AccountKeys = {
  /** Sent in place of the password. The server never sees anything else. */
  authSecret: string
  /** Never leaves the device. Unwraps the envelope that holds the content key. */
  wrappingKey: Uint8Array<ArrayBuffer>
}

/**
 * The email, as a salt.
 *
 * It has to be something both sides know before anyone is signed in — a
 * per-account random salt would have to be fetched first, and an endpoint that
 * hands out salts by email is an endpoint that confirms which emails have
 * accounts.
 *
 * Lowercased and trimmed so the same address typed two ways derives one key.
 */
function saltFor(email: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(email.trim().toLowerCase())
}

// `Uint8Array<ArrayBuffer>` for the same reason crypto.ts uses it: the bare
// type is generic over ArrayBufferLike, which admits SharedArrayBuffer, and
// WebCrypto will not take one.
async function expand(
  master: Uint8Array<ArrayBuffer>,
  info: string
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      // The expensive work is already done and its output is uniformly random,
      // so HKDF needs no salt of its own here. `info` is what separates them.
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info)
    },
    key,
    KEY_BYTES * 8
  )
  return new Uint8Array(bits)
}

/**
 * Both halves, from a password that goes no further than this function.
 *
 * Deliberately one call returning both: deriving them apart would mean running
 * scrypt twice, and the second caller would be the one tempted to skip it.
 */
export async function deriveAccountKeys(email: string, password: string): Promise<AccountKeys> {
  // Copied into an ArrayBuffer-backed view: @noble returns the bare generic
  // form, and WebCrypto below needs the narrower one.
  const master = new Uint8Array(scrypt(new TextEncoder().encode(password), saltFor(email), SCRYPT))
  const [auth, wrap] = await Promise.all([expand(master, AUTH_INFO), expand(master, WRAP_INFO)])

  return { authSecret: btoa(String.fromCharCode(...auth)), wrappingKey: wrap }
}

/** A new vault key: random, and belonging to the reader rather than to a password. */
export function newContentKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES))
}

/**
 * Seals the content key so a factor can open it.
 *
 * One of these per factor — the password's, and the recovery key's — over the
 * same content key, which is what makes them equals.
 */
export async function wrapContentKey(
  contentKey: Uint8Array<ArrayBuffer>,
  wrappingKey: Uint8Array<ArrayBuffer>
): Promise<string> {
  return seal(contentKey, wrappingKey)
}

/** Opens one, or throws — the same refusal an altered note gets. */
export async function unwrapContentKey(
  envelope: string,
  wrappingKey: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await unseal(envelope, wrappingKey)
  if (key.length !== KEY_BYTES) throw new Error("That envelope did not hold a vault key")
  return key
}

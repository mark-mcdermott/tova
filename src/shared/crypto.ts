/**
 * The envelope a sealed note lives in, for everywhere that is not the desktop.
 *
 * The Rust in `src-tauri/src/crypto.rs` is the same format and has been the
 * only implementation since the Electron one was removed. A web client has to
 * open the vaults a Mac sealed, and seal ones a Mac can open, so this is held
 * to `conformance/crypto.json` — a set of files written by both backends that
 * both must decrypt to the same bytes. That fixture is the contract; this file
 * agreeing with itself would prove nothing.
 *
 * scrypt comes from @noble/hashes because WebCrypto has no KDF but PBKDF2 and
 * HKDF, and changing the KDF would lock every vault already sealed.
 * Everything else is WebCrypto: AES-256-GCM, which it does have.
 */

import { scrypt } from "@noble/hashes/scrypt.js"

/** The first line of every encrypted file, and how one is recognised. */
export const MAGIC = "TOVA-ENCRYPTED-V1"

const IV_BYTES = 12
export const KEY_BYTES = 32

/** The same parameters the Rust passes, and the fixture pins. */
const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: KEY_BYTES }

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/*
 * `Uint8Array<ArrayBuffer>` rather than a bare one throughout.
 *
 * TypeScript makes the array generic over its buffer, and the bare form means
 * `ArrayBufferLike` — which includes `SharedArrayBuffer`, which WebCrypto will
 * not take. Saying the narrower type is what the API actually needs; casting
 * to `BufferSource` would also compile, but that name is only declared with
 * the DOM lib and `src/shared` is typechecked without it so it can run in Node.
 */
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/**
 * Whether a file is one of ours.
 *
 * A prefix rather than a whole first line: the magic is what identifies the
 * format, and a file that begins with it and is then truncated is still ours
 * and still has to fail as ours rather than be read as prose.
 */
export function looksEncrypted(text: string): boolean {
  return text.startsWith(MAGIC)
}

/*
 * The alphabet a recovery key is written in, and its shape.
 *
 * Matches `crypto.rs` exactly, because a key generated here has to be one the
 * Mac accepts and vice versa. I, O, 0 and 1 are absent: a key gets copied onto
 * paper and read back, and those four are the pairs that get misread.
 *
 * 256 divides evenly by 32, so folding a random byte into the alphabet is
 * unbiased. It would not be for an alphabet of any other size, and the bias
 * would be silent.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const GROUPS = 6
const GROUP_SIZE = 4

/**
 * A new recovery key: six groups of four, dash separated.
 *
 * 24 characters of key out of a 32-letter alphabet is 120 bits, which is not a
 * thing anybody guesses. The dashes are for reading it back off paper and are
 * stripped before use, so it can be typed however it looks.
 */
export function newRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GROUPS * GROUP_SIZE))
  const letters = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length])

  return Array.from({ length: GROUPS }, (_, group) =>
    letters.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE).join("")
  ).join("-")
}

/**
 * What was written down, as the bytes it stands for.
 *
 * Dashes and whitespace are how it is written, not what it is — someone
 * copying one off paper will group it however it reads, and in whatever case.
 * Nothing is filtered to the alphabet: a mistyped letter has to derive the
 * wrong key and fail to unwrap, rather than be quietly dropped into a
 * different key that is also wrong.
 */
export function normalizeRecoveryKey(key: string): string {
  return key.replace(/[\s-]/g, "").toUpperCase()
}

/** The key that wraps the vault key, derived from what was written down. */
export function recoveryKeyToCipherKey(
  key: string,
  salt: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  return scrypt(new TextEncoder().encode(normalizeRecoveryKey(key)), salt, SCRYPT)
}

async function cipherKey(
  key: Uint8Array<ArrayBuffer>,
  use: "encrypt" | "decrypt"
): Promise<CryptoKey> {
  if (key.length !== KEY_BYTES) throw new Error("A vault key is 32 bytes")
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, [use])
}

/**
 * Seals bytes into an envelope.
 *
 * A fresh nonce every time, which is why there is no sealed output to pin in
 * the fixture — only files to open. Reusing one under a single key is the
 * mistake that takes GCM apart, so it is never derived from anything.
 */
export async function seal(
  plain: Uint8Array<ArrayBuffer>,
  key: Uint8Array<ArrayBuffer>
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cipherKey(key, "encrypt"),
    plain
  )

  // WebCrypto appends the tag, which is the order Node's `cipher.final()` then
  // `getAuthTag()` produced and the order the Rust writes.
  return `${MAGIC}\n${toBase64(iv)}\n${toBase64(new Uint8Array(sealed))}\n`
}

/**
 * Opens one, or throws.
 *
 * Throwing is the feature. An authenticated cipher is only worth having if an
 * altered file fails rather than decrypting to something plausible, so every
 * refusal here is deliberate and the fixture has a list of them.
 */
export async function unseal(
  envelope: string,
  key: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const [magic, iv, payload] = envelope.split("\n")
  if (magic !== MAGIC || iv === undefined || payload === undefined) {
    throw new Error("That file is not a sealed note")
  }

  let opened: ArrayBuffer
  try {
    opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      await cipherKey(key, "decrypt"),
      fromBase64(payload)
    )
  } catch {
    // Deliberately one message for every way it can fail. Which part was wrong
    // — the key, the nonce, a byte of the ciphertext — is not something to tell
    // whoever is holding the file.
    throw new Error("That file could not be opened")
  }
  return new Uint8Array(opened)
}

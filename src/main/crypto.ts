import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptWithCallback } from "crypto"
import { promisify } from "util"

const scrypt = promisify(scryptWithCallback) as (
  password: string,
  salt: Buffer,
  length: number
) => Promise<Buffer>

/*
 * AES-256-GCM from Node's own crypto: authenticated, so a file that has been
 * altered fails to open rather than opening as something else, and no
 * dependency to trust with the one thing in this app that must not be trusted
 * lightly.
 */
const CIPHER = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16
export const KEY_BYTES = 32

/**
 * The first line of every encrypted file. A vault's files stay files — text,
 * syncable, and recognisable for what they are rather than a blob that looks
 * like corruption.
 */
const MAGIC = "TOVA-ENCRYPTED-V1"

export function looksEncrypted(text: string): boolean {
  return text.startsWith(MAGIC)
}

export function newKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

/** Magic, nonce and payload, a line each. */
export function seal(plain: Buffer, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(CIPHER, key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const payload = Buffer.concat([body, cipher.getAuthTag()])

  return `${MAGIC}\n${iv.toString("base64")}\n${payload.toString("base64")}\n`
}

export function unseal(envelope: string, key: Buffer): Buffer {
  const [magic, iv, payload] = envelope.split("\n")
  if (magic !== MAGIC || iv === undefined || payload === undefined) {
    throw new Error("That is not a Tova encrypted file")
  }

  const bytes = Buffer.from(payload, "base64")
  if (bytes.length < TAG_BYTES) throw new Error("The file is too short to be intact")

  const decipher = createDecipheriv(CIPHER, key, Buffer.from(iv, "base64"))
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES))
  return Buffer.concat([
    decipher.update(bytes.subarray(0, bytes.length - TAG_BYTES)),
    decipher.final()
  ])
}

/*
 * No I, O, 0 or 1: a recovery key is written on paper and read back by someone
 * who has just lost their keychain, and that is the wrong moment to be deciding
 * whether a character is a letter or a digit.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const GROUPS = 6
const GROUP_SIZE = 4

/** Six groups of four from a 32-letter alphabet — 120 bits, written down once. */
export function newRecoveryKey(): string {
  const bytes = randomBytes(GROUPS * GROUP_SIZE)
  const letters = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length])

  return Array.from({ length: GROUPS }, (_unused, group) =>
    letters.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE).join("")
  ).join("-")
}

/** Dashes, spaces and case are how it was written down, not what it means. */
export function normalizeRecoveryKey(key: string): string {
  return key.replace(/[\s-]/g, "").toUpperCase()
}

/**
 * The key that wraps the vault key, derived from what was written down.
 *
 * scrypt rather than a plain hash: the recovery key lives on paper and its
 * wrapped copy lives in the vault, which travels, so the cost of guessing has
 * to be paid in memory as well as time.
 */
export async function recoveryKeyToCipherKey(key: string, salt: Buffer): Promise<Buffer> {
  return scrypt(normalizeRecoveryKey(key), salt, KEY_BYTES)
}

export function newSalt(): Buffer {
  return randomBytes(16)
}

import { describe, it, expect } from "vitest"
import { deriveAccountKeys, newContentKey, wrapContentKey, unwrapContentKey } from "./accountKeys"
import { KEY_BYTES } from "./crypto"

const EMAIL = "mark@markmcdermott.io"
const PASSWORD = "a long enough password to be worth having"

describe("splitting a password in two", () => {
  /*
   * The property the whole design rests on. If these were equal, or if one
   * could be computed from the other, then the server — which is handed the
   * auth secret on every sign-in — would hold the key to every note.
   */
  it("gives the server something that is not the key to anything", async () => {
    const { authSecret, wrappingKey } = await deriveAccountKeys(EMAIL, PASSWORD)

    expect(authSecret).not.toBe("")
    expect(Uint8Array.from(atob(authSecret), (c) => c.charCodeAt(0))).not.toEqual(wrappingKey)
  })

  it("derives the same two every time, or nobody could sign in twice", async () => {
    const first = await deriveAccountKeys(EMAIL, PASSWORD)
    const second = await deriveAccountKeys(EMAIL, PASSWORD)

    expect(second.authSecret).toBe(first.authSecret)
    expect(second.wrappingKey).toEqual(first.wrappingKey)
  })

  it("derives a key of the size the cipher wants", async () => {
    const { wrappingKey } = await deriveAccountKeys(EMAIL, PASSWORD)

    expect(wrappingKey).toHaveLength(KEY_BYTES)
  })

  it("changes completely when the password does", async () => {
    const mine = await deriveAccountKeys(EMAIL, PASSWORD)
    const other = await deriveAccountKeys(EMAIL, `${PASSWORD} `)

    expect(other.authSecret).not.toBe(mine.authSecret)
    expect(other.wrappingKey).not.toEqual(mine.wrappingKey)
  })

  /*
   * The email is the salt, so two people with the same password still derive
   * different keys — which is the thing a salt is for.
   */
  it("changes completely when the email does", async () => {
    const mine = await deriveAccountKeys(EMAIL, PASSWORD)
    const other = await deriveAccountKeys("someone@else.com", PASSWORD)

    expect(other.authSecret).not.toBe(mine.authSecret)
    expect(other.wrappingKey).not.toEqual(mine.wrappingKey)
  })

  /*
   * Typing your own address with a capital or a stray space is not a different
   * account, and must not derive a different key — the notes would simply stop
   * opening, with the password correct.
   */
  it("reads an address typed carelessly as the same address", async () => {
    const plain = await deriveAccountKeys(EMAIL, PASSWORD)
    const careless = await deriveAccountKeys(`  ${EMAIL.toUpperCase()}  `, PASSWORD)

    expect(careless.authSecret).toBe(plain.authSecret)
    expect(careless.wrappingKey).toEqual(plain.wrappingKey)
  })
})

/*
 * The cost of guessing a password is scrypt's N, and nothing else in this file
 * was watching it: dropping it from 16384 to 2 passed every other test here.
 * The whole of the password's protection would have gone, silently, in a
 * one-character diff.
 *
 * So the derivation is pinned to a value. It fails if N, r or p change, if the
 * email stops being the salt, or if either HKDF label is edited — every one of
 * which would lock out existing accounts or quietly weaken them.
 *
 * Changing it on purpose means re-wrapping every envelope that exists, which
 * is exactly the deliberation a change here deserves.
 */
describe("the derivation itself, pinned", () => {
  const AUTH = "lTFdevEHFYHjvtOcIQui5Ktdjt+deXYISGonJN33OB0="
  const WRAP = "kZSIEWUhKwVlUN0W8ICmFudz6voTV8iHy6g0AEHx+eQ="

  it("derives exactly what it derived when this was written", async () => {
    const { authSecret, wrappingKey } = await deriveAccountKeys(EMAIL, PASSWORD)

    expect(authSecret).toBe(AUTH)
    expect(btoa(String.fromCharCode(...wrappingKey))).toBe(WRAP)
  })
})

describe("the content key", () => {
  it("is random, and the right size for the cipher", () => {
    const key = newContentKey()

    expect(key).toHaveLength(KEY_BYTES)
    expect(newContentKey()).not.toEqual(key)
  })

  it("comes back out of the envelope it went into", async () => {
    const content = newContentKey()
    const { wrappingKey } = await deriveAccountKeys(EMAIL, PASSWORD)

    const envelope = await wrapContentKey(content, wrappingKey)

    expect(await unwrapContentKey(envelope, wrappingKey)).toEqual(content)
  })

  it("will not come out for the wrong password", async () => {
    const content = newContentKey()
    const mine = await deriveAccountKeys(EMAIL, PASSWORD)
    const wrong = await deriveAccountKeys(EMAIL, "not it")

    const envelope = await wrapContentKey(content, mine.wrappingKey)

    await expect(unwrapContentKey(envelope, wrong.wrappingKey)).rejects.toThrow()
  })

  /*
   * The reason the content key is independent of the password rather than
   * derived from it: changing a password re-wraps one small envelope, instead
   * of re-encrypting every note anybody has ever written.
   */
  it("survives a password change, which only re-wraps the envelope", async () => {
    const content = newContentKey()
    const before = await deriveAccountKeys(EMAIL, PASSWORD)
    const after = await deriveAccountKeys(EMAIL, "something else entirely")

    const reWrapped = await wrapContentKey(
      await unwrapContentKey(await wrapContentKey(content, before.wrappingKey), before.wrappingKey),
      after.wrappingKey
    )

    expect(await unwrapContentKey(reWrapped, after.wrappingKey)).toEqual(content)
  })

  /*
   * Two factors, one key, equal standing. Losing the password is not losing
   * the notes, and that is the only thing making the recovery key worth the
   * trouble of writing down.
   */
  it("opens for either factor, because both wrap the same key", async () => {
    const content = newContentKey()
    const password = await deriveAccountKeys(EMAIL, PASSWORD)
    const recovery = await deriveAccountKeys(EMAIL, "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ")

    const [byPassword, byRecovery] = await Promise.all([
      wrapContentKey(content, password.wrappingKey),
      wrapContentKey(content, recovery.wrappingKey)
    ])

    expect(await unwrapContentKey(byPassword, password.wrappingKey)).toEqual(content)
    expect(await unwrapContentKey(byRecovery, recovery.wrappingKey)).toEqual(content)
    expect(byPassword).not.toBe(byRecovery)
  })

  it("refuses an envelope that does not hold a key at all", async () => {
    const { wrappingKey } = await deriveAccountKeys(EMAIL, PASSWORD)
    const notAKey = await wrapContentKey(
      new TextEncoder().encode("hello") as Uint8Array<ArrayBuffer>,
      wrappingKey
    )

    await expect(unwrapContentKey(notAKey, wrappingKey)).rejects.toThrow("vault key")
  })
})

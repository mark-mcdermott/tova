import { describe, it, expect } from "vitest"
import {
  KEY_BYTES,
  looksEncrypted,
  newKey,
  newRecoveryKey,
  newSalt,
  normalizeRecoveryKey,
  recoveryKeyToCipherKey,
  seal,
  unseal
} from "./crypto"

describe("sealing a file", () => {
  const key = newKey()

  it("comes back exactly as it went in", () => {
    const plain = Buffer.from("# Slow morning\n\nCoffee. Empty streets.\n", "utf-8")

    expect(unseal(seal(plain, key), key).toString("utf-8")).toBe(plain.toString("utf-8"))
  })

  it("carries bytes as happily as words", () => {
    // Images live in the vault too, and go through the same envelope.
    const plain = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x01])

    expect([...unseal(seal(plain, key), key)]).toEqual([...plain])
  })

  it("looks like nothing of what it holds", () => {
    const envelope = seal(Buffer.from("Half-formed ideas.", "utf-8"), key)

    expect(envelope).not.toContain("Half-formed")
    expect(looksEncrypted(envelope)).toBe(true)
  })

  it("seals the same words differently every time", () => {
    // A fresh nonce each write, so two notes that say the same thing do not
    // announce that they do.
    const plain = Buffer.from("Coffee.", "utf-8")

    expect(seal(plain, key)).not.toBe(seal(plain, key))
  })

  it("refuses a key that is not the one it was sealed with", () => {
    const envelope = seal(Buffer.from("Coffee.", "utf-8"), key)

    expect(() => unseal(envelope, newKey())).toThrow()
  })

  it("refuses a file that has been meddled with", () => {
    // The point of an authenticated cipher: altered text fails to open rather
    // than opening as something else.
    const envelope = seal(Buffer.from("Coffee.", "utf-8"), key)
    const lines = envelope.split("\n")
    const bytes = Buffer.from(lines[2], "base64")
    bytes[0] ^= 0xff
    lines[2] = bytes.toString("base64")

    expect(() => unseal(lines.join("\n"), key)).toThrow()
  })

  it("refuses anything that is not an envelope at all", () => {
    expect(() => unseal("# Just a note\n", key)).toThrow()
    expect(looksEncrypted("# Just a note\n")).toBe(false)
  })
})

describe("the recovery key", () => {
  it("is six groups of four, in letters that cannot be misread", () => {
    const key = newRecoveryKey()

    expect(key).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){5}$/)
    // No I, O, 0 or 1: it is read off paper by someone having a bad day.
    expect(key).not.toMatch(/[IO01]/)
  })

  it("is a different one every time", () => {
    expect(newRecoveryKey()).not.toBe(newRecoveryKey())
  })

  it("reads the same however it was written down", () => {
    expect(normalizeRecoveryKey("k7m4-q2xp")).toBe("K7M4Q2XP")
    expect(normalizeRecoveryKey("K7M4 Q2XP")).toBe("K7M4Q2XP")
    expect(normalizeRecoveryKey("  K7M4Q2XP ")).toBe("K7M4Q2XP")
  })

  it("unwraps a vault key it wrapped, whatever the spacing", async () => {
    const vaultKey = newKey()
    const recovery = newRecoveryKey()
    const salt = newSalt()

    const wrapping = await recoveryKeyToCipherKey(recovery, salt)
    const envelope = seal(vaultKey, wrapping)

    const typedBack = await recoveryKeyToCipherKey(recovery.toLowerCase().replace(/-/g, " "), salt)
    expect(unseal(envelope, typedBack)).toEqual(vaultKey)
    expect(unseal(envelope, typedBack)).toHaveLength(KEY_BYTES)
  })

  it("will not unwrap it with the wrong key", async () => {
    const salt = newSalt()
    const envelope = seal(newKey(), await recoveryKeyToCipherKey(newRecoveryKey(), salt))

    await expect(async () =>
      unseal(envelope, await recoveryKeyToCipherKey(newRecoveryKey(), salt))
    ).rejects.toThrow()
  })

  it("derives a different wrapping key from the same words under a new salt", async () => {
    const recovery = newRecoveryKey()
    const one = await recoveryKeyToCipherKey(recovery, newSalt())
    const two = await recoveryKeyToCipherKey(recovery, newSalt())

    expect(one).not.toEqual(two)
  })
})

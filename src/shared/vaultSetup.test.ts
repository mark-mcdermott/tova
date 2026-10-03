import { describe, it, expect } from "vitest"
import {
  prepareVault,
  authSecretFor,
  unlockWithPassword,
  unlockWithRecoveryKey,
  reWrapForPassword,
  replaceRecoveryKey
} from "./vaultSetup"
import { looksEncrypted } from "./crypto"

const EMAIL = "mark@markmcdermott.io"
const PASSWORD = "a long enough password to be worth having"

describe("making a vault", () => {
  it("produces both envelopes, a key to show once, and nothing else to send", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    expect(looksEncrypted(vault.envelopes.password.envelope)).toBe(true)
    expect(looksEncrypted(vault.envelopes.recovery.envelope)).toBe(true)
    expect(vault.recoveryKey).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/)
    expect(vault.authSecret).not.toBe("")
  })

  /*
   * The property the whole scheme rests on. If the content key could be read
   * out of what is sent, the server would hold the key to every note.
   */
  it("sends nothing the content key can be recovered from", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)
    const sent = JSON.stringify({ authSecret: vault.authSecret, envelopes: vault.envelopes })
    const key = btoa(String.fromCharCode(...vault.contentKey))

    expect(sent).not.toContain(key)
    expect(sent).not.toContain(PASSWORD)
    expect(sent).not.toContain(vault.recoveryKey)
  })

  it("mints a different vault every time, for the same credentials", async () => {
    const first = await prepareVault(EMAIL, PASSWORD)
    const second = await prepareVault(EMAIL, PASSWORD)

    expect(second.contentKey).not.toEqual(first.contentKey)
    expect(second.recoveryKey).not.toBe(first.recoveryKey)
    // The auth secret is derived, so it is the one thing that must not differ.
    expect(second.authSecret).toBe(first.authSecret)
  })

  /*
   * A salt that never varies is not a salt. Two vaults sharing one would let a
   * single table of derivations attack every account at once, and nothing else
   * in this file would notice — a fixed salt passed every other test here.
   */
  it("salts each recovery key differently", async () => {
    const first = await prepareVault(EMAIL, PASSWORD)
    const second = await prepareVault(EMAIL, PASSWORD)

    expect(second.envelopes.recovery.salt).not.toBe(first.envelopes.recovery.salt)
    expect(atob(first.envelopes.recovery.salt)).toHaveLength(16)
  })

  it("derives the same auth secret whether or not a vault is being made", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    expect(await authSecretFor(EMAIL, PASSWORD)).toBe(vault.authSecret)
  })
})

describe("getting back in", () => {
  it("opens with the password", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    expect(await unlockWithPassword(PASSWORD, vault.envelopes.password)).toEqual(vault.contentKey)
  })

  it("opens with the recovery key, which is the same key by another door", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    expect(await unlockWithRecoveryKey(vault.recoveryKey, vault.envelopes.recovery)).toEqual(
      vault.contentKey
    )
  })

  it("reads a recovery key off paper however it was written", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)
    const careless = `  ${vault.recoveryKey.toLowerCase().replace(/-/g, " ")}  `

    expect(await unlockWithRecoveryKey(careless, vault.envelopes.recovery)).toEqual(
      vault.contentKey
    )
  })

  it("opens for neither a wrong password nor a wrong recovery key", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    await expect(unlockWithPassword("not it", vault.envelopes.password)).rejects.toThrow()
    await expect(
      unlockWithRecoveryKey("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF", vault.envelopes.recovery)
    ).rejects.toThrow()
  })

  /*
   * The salt is the address the envelope was sealed under, and it is read from
   * the envelope rather than from whatever is on screen. Deriving from a
   * changed email would produce a key that opens nothing, which reads to the
   * person typing as a wrong password.
   */
  it("uses the address the envelope was sealed under, not the one typed today", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)
    const renamed = { ...vault.envelopes.password }

    expect(await unlockWithPassword(PASSWORD, renamed)).toEqual(vault.contentKey)
    expect(atob(renamed.salt)).toBe(EMAIL)
  })
})

describe("changing a factor", () => {
  /*
   * Re-wrapping is one envelope, never a note. That is what the content key
   * being independent of any password buys, and it is the difference between
   * a password change and re-encrypting everything anybody ever wrote.
   */
  it("re-wraps for a new password without touching the content key", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    const next = await reWrapForPassword(EMAIL, "something else entirely", vault.contentKey)

    expect(await unlockWithPassword("something else entirely", next.factor)).toEqual(
      vault.contentKey
    )
    expect(next.authSecret).not.toBe(vault.authSecret)
  })

  it("leaves the recovery key working after a password change", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    await reWrapForPassword(EMAIL, "something else entirely", vault.contentKey)

    expect(await unlockWithRecoveryKey(vault.recoveryKey, vault.envelopes.recovery)).toEqual(
      vault.contentKey
    )
  })

  it("replaces a recovery key, and the old one stops opening the new envelope", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    const next = await replaceRecoveryKey(vault.contentKey)

    expect(await unlockWithRecoveryKey(next.recoveryKey, next.factor)).toEqual(vault.contentKey)
    expect(next.recoveryKey).not.toBe(vault.recoveryKey)
    await expect(unlockWithRecoveryKey(vault.recoveryKey, next.factor)).rejects.toThrow()
  })

  /*
   * Every replacement is its own key. Comparing against the *previous* key is
   * not enough — a constant would differ from a random one and pass, while
   * handing every reader on earth the same recovery key.
   */
  it("mints a new recovery key each time it is asked, not one shared key", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    const many = await Promise.all(
      Array.from({ length: 5 }, () => replaceRecoveryKey(vault.contentKey))
    )

    expect(new Set(many.map((one) => one.recoveryKey)).size).toBe(5)
    expect(new Set(many.map((one) => one.factor.salt)).size).toBe(5)
  })

  /*
   * Revocation by deletion, not by cryptography — the honest version of
   * "the old key stops working". The old key still opens the old envelope
   * forever; what ends is the server serving it.
   */
  it("leaves the old recovery key opening the old envelope, which is why the row is deleted", async () => {
    const vault = await prepareVault(EMAIL, PASSWORD)

    await replaceRecoveryKey(vault.contentKey)

    expect(await unlockWithRecoveryKey(vault.recoveryKey, vault.envelopes.recovery)).toEqual(
      vault.contentKey
    )
  })
})

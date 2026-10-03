// Reads the fixture, so it says so — the renderer's tsconfig does not expect
// Node.
/// <reference types="node" />
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  MAGIC,
  looksEncrypted,
  newRecoveryKey,
  normalizeRecoveryKey,
  recoveryKeyToCipherKey,
  seal,
  unseal
} from "./crypto"

/*
 * The contract between this and `src-tauri/src/crypto.rs`.
 *
 * Not a list of inputs and the answers one side happens to give: sealing picks
 * a fresh nonce every time, so there is no output to pin. What is pinned is a
 * set of sealed files — some written by Node, some by Rust — that BOTH sides
 * must open and get the same bytes from. That is the only check that catches
 * the divergence that matters, which is a vault sealed on a Mac and opened in
 * a browser.
 *
 * `cargo test` reads the same file.
 */
const fixture = JSON.parse(readFileSync("conformance/crypto.json", "utf-8")) as {
  envelopes: { from: string; key: string; plain: string; envelope: string }[]
  refused: { why: string; key: string; envelope: string }[]
  scrypt: { recoveryKey: string; salt: string; derived: string }[]
  looksEncrypted: { text: string; is: boolean }[]
  normalizeRecoveryKey: { written: string; means: string }[]
}

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
const base64 = (raw: Uint8Array) => btoa(String.fromCharCode(...raw))

describe("the envelope, against the fixture", () => {
  it("has cases written by both backends, or it is checking one against itself", () => {
    const from = new Set(fixture.envelopes.map((row) => row.from))

    expect(fixture.envelopes.length).toBeGreaterThan(4)
    expect(from).toContain("node")
    expect(from).toContain("rust")
  })

  /*
   * `plain` is base64 of the bytes, not the text. Bytes are the contract: one
   * of these cases is a PNG header, and another is astral characters that a
   * round trip through a string could mangle without the comparison noticing.
   */
  it.each(fixture.envelopes)("opens the $from envelope #$# ", async (row) => {
    const opened = await unseal(row.envelope, bytes(row.key))

    expect(base64(opened)).toBe(row.plain)
  })

  /*
   * The other half, and the reason an authenticated cipher is worth having. A
   * changed byte, a changed nonce, a wrong key — each has to fail rather than
   * hand back something plausible.
   */
  it.each(fixture.refused)("refuses when $why", async (row) => {
    await expect(unseal(row.envelope, bytes(row.key))).rejects.toThrow()
  })

  it("seals what it can open again", async () => {
    const key = bytes(fixture.envelopes[0].key)
    const plain = new TextEncoder().encode("# A note\n\nWith a body.\n")

    const envelope = await seal(plain, key)

    expect(looksEncrypted(envelope)).toBe(true)
    expect(new TextDecoder().decode(await unseal(envelope, key))).toBe("# A note\n\nWith a body.\n")
  })

  /*
   * Fresh every time. There is no fixture case for this because there is no
   * output to pin — which is exactly why it is worth asserting here.
   */
  it("never seals the same bytes the same way twice", async () => {
    const key = bytes(fixture.envelopes[0].key)
    const plain = new TextEncoder().encode("same")

    const [first, second] = [await seal(plain, key), await seal(plain, key)]

    expect(first).not.toBe(second)
  })

  it("writes the three-line envelope the Rust writes", async () => {
    const envelope = await seal(new TextEncoder().encode("x"), bytes(fixture.envelopes[0].key))
    const [magic, nonce, payload, trailing] = envelope.split("\n")

    expect(magic).toBe(MAGIC)
    // 12 bytes of nonce is 16 characters of base64, the last of them padding.
    expect(nonce).toHaveLength(16)
    expect(payload.length).toBeGreaterThan(0)
    expect(trailing).toBe("")
  })

  it("refuses a key that is not 32 bytes", async () => {
    await expect(seal(new Uint8Array([1]), new Uint8Array(16))).rejects.toThrow("32 bytes")
  })
})

describe("scrypt, against the fixture", () => {
  /*
   * The parameters, not the implementation. The TypeScript used to take Node's
   * defaults; if either side used any others every recovery key would be
   * silently wrong, and no test of one side against itself would notice.
   */
  it.each(fixture.scrypt)("derives the pinned key from $recoveryKey", (row) => {
    const derived = recoveryKeyToCipherKey(row.recoveryKey, bytes(row.salt))

    expect(base64(derived)).toBe(row.derived)
  })
})

describe("reading a recovery key as it was written", () => {
  it.each(fixture.normalizeRecoveryKey)("reads $written", (row) => {
    expect(normalizeRecoveryKey(row.written)).toBe(row.means)
  })

  /*
   * Nothing is filtered to the alphabet. A mistyped letter has to derive the
   * wrong key and fail to unwrap, rather than be dropped into a different key
   * that is also wrong but fails somewhere less obvious.
   */
  it("keeps a character the alphabet does not contain", () => {
    expect(normalizeRecoveryKey("ABCI")).toBe("ABCI")
  })
})

describe("recognising one of our files", () => {
  it.each(fixture.looksEncrypted)("says $is for $text", (row) => {
    expect(looksEncrypted(row.text)).toBe(row.is)
  })
})

describe("minting a recovery key", () => {
  /*
   * The format is a contract with the Rust, not a presentation choice: a key
   * made here has to be one a Mac accepts, and vice versa. `crypto.rs` is the
   * other half.
   */
  it("is six groups of four, dash separated", () => {
    expect(newRecoveryKey()).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/)
    expect(newRecoveryKey()).toHaveLength(29)
  })

  /*
   * I, O, 0 and 1 are absent because a key gets written on paper and read back,
   * and those four are the pairs that get misread.
   */
  it("uses no letter that could be mistaken for another", () => {
    const made = Array.from({ length: 200 }, newRecoveryKey).join("").replace(/-/g, "")

    expect(made).not.toMatch(/[IO01]/)
    expect(new Set(made).size).toBe(32)
  })

  it("is a different key every time", () => {
    const many = new Set(Array.from({ length: 50 }, newRecoveryKey))

    expect(many.size).toBe(50)
  })

  it("survives being read back in any shape", () => {
    const key = newRecoveryKey()

    expect(normalizeRecoveryKey(key.toLowerCase().replace(/-/g, " "))).toBe(
      normalizeRecoveryKey(key)
    )
  })
})

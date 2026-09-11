import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  looksEncrypted,
  normalizeRecoveryKey,
  recoveryKeyToCipherKey,
  seal,
  unseal
} from "./crypto"

/*
 * The other half of the Rust tests in src-tauri/src/crypto.rs.
 *
 * The fixture holds files sealed by both backends, and each side opens all of
 * them. This one is what catches a Rust envelope the TypeScript cannot read —
 * which is the failure that matters, because it is a reader's notes.
 *
 * Regenerating, if the format ever changes deliberately: seal the same
 * plaintexts under each backend and replace the matching entries. Never
 * regenerate to make a failing test pass; a fixture that moves to meet the
 * code is a fixture that checks nothing.
 */
interface Fixture {
  envelopes: { from: string; key: string; plain: string; envelope: string }[]
  refused: { why: string; key: string; envelope: string }[]
  scrypt: { recoveryKey: string; salt: string; derived: string }[]
  looksEncrypted: { text: string; is: boolean }[]
  normalizeRecoveryKey: { written: string; means: string }[]
}

const doc: Fixture = JSON.parse(readFileSync("conformance/crypto.json", "utf-8"))
const b64 = (value: string): Buffer => Buffer.from(value, "base64")

describe("files the other backend sealed", () => {
  it("has some from each, or the fixture is only checking itself", () => {
    expect(doc.envelopes.some((one) => one.from === "rust")).toBe(true)
    expect(doc.envelopes.some((one) => one.from === "node")).toBe(true)
  })

  it("opens every one of them, to exactly the bytes that went in", () => {
    doc.envelopes.forEach((one, at) => {
      const opened = unseal(one.envelope, b64(one.key))

      expect([...opened], `envelope ${at}, sealed by ${one.from}`).toEqual([...b64(one.plain)])
    })
  })
})

describe("files that must not open", () => {
  it("refuses every one of them", () => {
    for (const one of doc.refused) {
      expect(() => unseal(one.envelope, b64(one.key)), one.why).toThrow()
    }
  })
})

describe("the key derived from what was written down", () => {
  it("comes from the same parameters on both sides", async () => {
    for (const one of doc.scrypt) {
      const derived = await recoveryKeyToCipherKey(one.recoveryKey, b64(one.salt))

      expect(derived.toString("base64"), `for ${one.recoveryKey}`).toBe(one.derived)
    }
  })
})

describe("what both backends call an encrypted file", () => {
  it("is the same set of files", () => {
    for (const one of doc.looksEncrypted) {
      expect(looksEncrypted(one.text), JSON.stringify(one.text)).toBe(one.is)
    }
  })
})

describe("what both backends make of a key as it was typed", () => {
  it("is the same string", () => {
    for (const one of doc.normalizeRecoveryKey) {
      expect(normalizeRecoveryKey(one.written), JSON.stringify(one.written)).toBe(one.means)
    }
  })
})

describe("the fixture itself", () => {
  it("describes an envelope this backend still writes", () => {
    // A guard against the fixture becoming a recording of one side only: what
    // is sealed here now has to satisfy the same rules the fixture asserts.
    const key = b64(doc.envelopes[0].key)
    const fresh = seal(Buffer.from("Coffee.", "utf-8"), key)

    expect(looksEncrypted(fresh)).toBe(true)
    expect(unseal(fresh, key).toString("utf-8")).toBe("Coffee.")
  })
})

import { describe, it, expect } from "vitest"
import { available, unexportable } from "./keyStore"
import { seal, unseal } from "../../src/shared/crypto"

const bytes = () => crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>
const text = (value: string) => new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>

/*
 * The IndexedDB half is not tested here, deliberately.
 *
 * jsdom has no IndexedDB, and the obvious fix — a fake — would be worse than
 * nothing: the whole claim is that a `CryptoKey` survives being stored and
 * comes back still unreadable, and a fake's structured clone is not the
 * browser's. A green test against it would prove something about the fake.
 *
 * So what is held here is what real WebCrypto can answer, which is the part
 * that carries the guarantee. The round trip was run against a real browser
 * instead, importing this module from the dev server:
 *
 *     available: true
 *     recalled: epoch 1
 *     is a CryptoKey: true
 *     extractable: false
 *     usages: encrypt,decrypt
 *     exportKey after storage: refused
 *     decrypts what the raw bytes sealed: true
 *     and seals too: true
 *     after forget: nothing
 */
describe("a key this device can use and not read", () => {
  it("refuses to be exported", async () => {
    const key = await unexportable(bytes())

    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow()
  })

  /*
   * Both, because a vault is written to as well as read from. A key imported
   * for one of them would make every note after the first page load
   * unsaveable, and the failure would arrive at the worst possible moment.
   */
  it("can both encrypt and decrypt", async () => {
    const key = await unexportable(bytes())

    expect([...key.usages].sort()).toEqual(["decrypt", "encrypt"])
  })

  it("opens what the raw bytes sealed, and seals what they can open", async () => {
    const raw = bytes()
    const key = await unexportable(raw)
    // Compared as text, not with `toEqual`: a `TextEncoder` result can sit in a
    // buffer larger than the view, and the comparison reads that as a
    // difference while printing two values that look identical.
    const read = (opened: Uint8Array) => new TextDecoder().decode(opened)

    expect(read(await unseal(await seal(text("a note"), raw), key))).toBe("a note")
    expect(read(await unseal(await seal(text("a note"), key), raw))).toBe("a note")
  })

  /*
   * A content key is something unsealed, handed straight back as a key, and
   * this is that path end to end.
   *
   * What it does not cover: whether the check that tells bytes from an imported
   * key is `instanceof` or `ArrayBuffer.isView`. Both answer the same here, and
   * swapping one for the other passes. They differ only across a realm, which
   * needs a worker or an iframe and nothing here has either.
   */
  it("takes a key that itself came out of an envelope", async () => {
    const wrapping = bytes()
    const contentKey = await unseal(await seal(bytes(), wrapping), wrapping)

    const sealed = await seal(text("a note"), contentKey)
    expect(new TextDecoder().decode(await unseal(sealed, contentKey))).toBe("a note")
  })

  it("is not the same key as another vault's", async () => {
    const sealed = await seal(text("a note"), bytes())

    await expect(unseal(sealed, await unexportable(bytes()))).rejects.toThrow()
  })

  /*
   * A key imported for one use is refused for the other rather than failing
   * somewhere deeper. The raw-bytes path gets this from WebCrypto, which is
   * handed a single usage; a stored key carries both, so the check moves to
   * the moment it is used.
   */
  it("refuses a key that was never given the use it is being put to", async () => {
    const readOnly = await crypto.subtle.importKey("raw", bytes(), "AES-GCM", false, ["decrypt"])

    await expect(seal(text("a note"), readOnly)).rejects.toThrow("That key cannot encrypt")
  })

  it("says plainly when this browser cannot keep a key at all", () => {
    // Which is the case here, and is also the case in some private windows.
    expect(available()).toBe(false)
  })
})

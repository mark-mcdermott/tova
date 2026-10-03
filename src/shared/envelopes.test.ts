import { describe, it, expect } from "vitest"
import {
  createEnvelopes,
  envelope,
  currentEpoch,
  envelopeFor,
  type StoredEnvelope
} from "./envelopes"

const SEALED = "TOVA-ENCRYPTED-V1\nAAAAAAAAAAAAAAA=\nZm9vYmFy\n"
const SALT = "c2FsdA=="

const row = (over: Partial<StoredEnvelope> = {}): StoredEnvelope => ({
  kind: "password",
  salt: SALT,
  envelope: SEALED,
  epoch: 1,
  ...over
})

describe("an envelope on the wire", () => {
  it("carries a sealed key and the salt its factor used", () => {
    expect(envelope.parse({ kind: "password", salt: SALT, envelope: SEALED })).toEqual({
      kind: "password",
      salt: SALT,
      envelope: SEALED
    })
  })

  /*
   * The magic is checked here as well as by `unseal`, so a body that is not an
   * envelope at all is refused before it is ever stored — a row that cannot be
   * opened is worse than a request that was turned away.
   */
  it("refuses something that is not a sealed envelope", () => {
    expect(envelope.safeParse({ kind: "password", salt: SALT, envelope: "hello" }).success).toBe(
      false
    )
  })

  it("refuses a salt that is not base64", () => {
    expect(
      envelope.safeParse({ kind: "password", salt: "not salt!", envelope: SEALED }).success
    ).toBe(false)
  })

  it("refuses a factor nobody has", () => {
    expect(envelope.safeParse({ kind: "fingerprint", salt: SALT, envelope: SEALED }).success).toBe(
      false
    )
  })

  /*
   * Both or neither. One at a time would allow an account with a password
   * envelope and no recovery envelope — one way in and no way back, which is
   * the state the recovery key exists to prevent.
   */
  it("will not create one factor without the other", () => {
    const pair = { salt: SALT, envelope: SEALED }

    expect(createEnvelopes.safeParse({ password: pair, recovery: pair }).success).toBe(true)
    expect(createEnvelopes.safeParse({ password: pair }).success).toBe(false)
    expect(createEnvelopes.safeParse({ recovery: pair }).success).toBe(false)
  })
})

describe("choosing which epoch to read", () => {
  it("takes the only complete pair", () => {
    expect(currentEpoch([row(), row({ kind: "recovery" })])).toBe(1)
  })

  /*
   * Starting fresh after a lost recovery key leaves the older epoch in place,
   * so a key found later still opens the notes it was made for. The newest
   * complete pair is the one to read.
   */
  it("takes the newest when an older one was left behind", () => {
    const envelopes = [
      row({ epoch: 1 }),
      row({ epoch: 1, kind: "recovery" }),
      row({ epoch: 2 }),
      row({ epoch: 2, kind: "recovery" })
    ]

    expect(currentEpoch(envelopes)).toBe(2)
  })

  /*
   * A half-written epoch is not somewhere to send anybody — it would unwrap
   * with a password and have no way back if that password were ever lost.
   */
  it("ignores an epoch missing one of its factors", () => {
    const envelopes = [row({ epoch: 1 }), row({ epoch: 1, kind: "recovery" }), row({ epoch: 2 })]

    expect(currentEpoch(envelopes)).toBe(1)
  })

  it("says nothing when there is no complete pair at all", () => {
    expect(currentEpoch([])).toBeNull()
    expect(currentEpoch([row()])).toBeNull()
  })

  it("finds one factor at one epoch", () => {
    const envelopes = [row({ epoch: 2 }), row({ epoch: 2, kind: "recovery", salt: "b3RoZXI=" })]

    expect(envelopeFor(envelopes, "recovery", 2)?.salt).toBe("b3RoZXI=")
    expect(envelopeFor(envelopes, "recovery", 1)).toBeNull()
  })
})

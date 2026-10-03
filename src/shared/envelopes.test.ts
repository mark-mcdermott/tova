import { describe, it, expect } from "vitest"
import {
  createEnvelopes,
  envelope,
  currentEpoch,
  envelopeFor,
  nextEpoch,
  replaceEnvelope,
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

    expect(createEnvelopes.safeParse({ epoch: 1, password: pair, recovery: pair }).success).toBe(
      true
    )
    expect(createEnvelopes.safeParse({ epoch: 1, password: pair }).success).toBe(false)
    expect(createEnvelopes.safeParse({ epoch: 1, recovery: pair }).success).toBe(false)
  })

  /*
   * Without it the server has nothing to check a create against, and a
   * double-submitted signup becomes a second content key rather than a
   * refusal. Epochs start at one and are whole numbers.
   */
  it("insists on the epoch it is being created at", () => {
    const pair = { salt: SALT, envelope: SEALED }
    const create = (epoch: unknown) =>
      createEnvelopes.safeParse({ epoch, password: pair, recovery: pair }).success

    expect(create(1)).toBe(true)
    expect(create(undefined)).toBe(false)
    expect(create(0)).toBe(false)
    expect(create(1.5)).toBe(false)
  })
})

describe("replacing one factor", () => {
  it("names the row it overwrites, and carries a sealed envelope", () => {
    expect(
      replaceEnvelope.parse({ kind: "recovery", epoch: 2, salt: SALT, envelope: SEALED })
    ).toEqual({ kind: "recovery", epoch: 2, salt: SALT, envelope: SEALED })
  })

  /*
   * `kind` and `epoch` are the address. A request missing either does not say
   * which row it means, and one carrying something that is not an envelope
   * would store a row nothing can open.
   */
  it("refuses a request that does not say which row, or carries no envelope", () => {
    expect(replaceEnvelope.safeParse({ epoch: 1, salt: SALT, envelope: SEALED }).success).toBe(
      false
    )
    expect(
      replaceEnvelope.safeParse({ kind: "password", salt: SALT, envelope: SEALED }).success
    ).toBe(false)
    expect(
      replaceEnvelope.safeParse({ kind: "password", epoch: 1, salt: SALT, envelope: "hello" })
        .success
    ).toBe(false)
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

describe("choosing which epoch to write", () => {
  it("starts at one when there is nothing", () => {
    expect(nextEpoch([])).toBe(1)
  })

  it("follows the highest epoch there is", () => {
    expect(nextEpoch([row(), row({ kind: "recovery" })])).toBe(2)
  })

  /*
   * Every epoch, not only the complete ones. A half-written epoch is not a
   * number to hand out again — doing so would overwrite the half that exists.
   */
  it("counts a half-written epoch as taken", () => {
    expect(nextEpoch([row(), row({ kind: "recovery" }), row({ epoch: 7 })])).toBe(8)
  })
})

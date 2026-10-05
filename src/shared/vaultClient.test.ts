import { describe, it, expect } from "vitest"
import {
  makeVaultClient,
  VaultRequestError,
  type Credentials,
  type VaultClient
} from "./vaultClient"
import { authSecretFor, unlockWithRecoveryKey } from "./vaultSetup"
import { createEnvelopes, nextEpoch, replaceEnvelope, type StoredEnvelope } from "./envelopes"

const EMAIL = "mark@markmcdermott.io"
const PASSWORD = "a long enough password to be worth having"
const NEXT = "a different long enough password"
/** Stands in for what an emailed reset link carries. */
const RESET_TOKEN = "a-reset-token"

/**
 * The two halves of a server, in memory.
 *
 * The envelope store enforces what the endpoint enforces — the epoch assertion
 * on a create, a row that has to exist for a replace — so the flows meet the
 * same refusals they will meet in production. The endpoint itself is verified
 * against the real database rather than against this.
 */
function fakeServer() {
  const secrets = new Map<string, string>()
  let rows: StoredEnvelope[] = []
  let signedIn: string | null = null
  let refuseWrites = false

  const credentials: Credentials = {
    async signUp(email, secret) {
      if (secrets.has(email)) throw new Error("That account already exists")
      secrets.set(email, secret)
      signedIn = email
    },
    async signIn(email, secret) {
      if (secrets.get(email) !== secret) throw new Error("Wrong email or password")
      signedIn = email
    },
    async changeSecret(current, next) {
      if (signedIn === null) throw new Error("Not signed in")
      if (secrets.get(signedIn) !== current) throw new Error("Wrong current password")
      secrets.set(signedIn, next)
    },
    async requestReset() {
      // Nothing to model: the mail is the server's business, and the flows do not read it.
    },
    /** No current secret and no session — the token stands in for both. */
    async resetSecret(token, next) {
      if (token !== RESET_TOKEN) throw new Error("That link has expired")
      secrets.set(EMAIL, next)
    }
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  const fetch = (async (_url: string, init: RequestInit) => {
    if (signedIn === null) return json({ error: "Not signed in" }, 401)

    if (init.method === "GET") return json({ envelopes: rows })
    if (refuseWrites) return json({ error: "No" }, 500)

    const body: unknown = JSON.parse(String(init.body))

    if (init.method === "POST") {
      const { epoch, password, recovery } = createEnvelopes.parse(body)
      if (epoch !== nextEpoch(rows)) return json({ error: "Taken" }, 409)

      rows = [
        ...rows,
        { kind: "password", epoch, ...password },
        { kind: "recovery", epoch, ...recovery }
      ]
      return json({ created: true, epoch }, 201)
    }

    const { kind, epoch, salt, envelope } = replaceEnvelope.parse(body)
    const at = rows.findIndex((row) => row.kind === kind && row.epoch === epoch)
    if (at === -1) return json({ error: "No such envelope" }, 404)

    rows = rows.map((row, index) => (index === at ? { kind, epoch, salt, envelope } : row))
    return json({ replaced: { kind, epoch } })
  }) as unknown as typeof globalThis.fetch

  return {
    client: makeVaultClient(credentials, fetch),
    rows: () => rows,
    /** What a password reset does: a new credential and an untouched envelope. */
    async resetPasswordTo(password: string) {
      secrets.set(EMAIL, await authSecretFor(EMAIL, password))
    },
    canSignIn: async (password: string) =>
      credentials
        .signIn(EMAIL, await authSecretFor(EMAIL, password))
        .then(() => true)
        .catch(() => false),
    refuseWrites: (yes: boolean) => {
      refuseWrites = yes
    },
    signOut: () => {
      signedIn = null
    }
  }
}

const signedUp = async () => {
  const server = fakeServer()
  const vault = await server.client.signUp(EMAIL, PASSWORD, "Mark")
  return { server, vault }
}

const unlock = async (client: VaultClient, password: string) => {
  const result = await client.signIn(EMAIL, password)
  if (result.state !== "unlocked") throw new Error(`expected unlocked, got ${result.state}`)
  return result
}

describe("signing up", () => {
  it("makes an account, both envelopes, and a recovery key to show once", async () => {
    const { server, vault } = await signedUp()

    expect(
      server
        .rows()
        .map((row) => `${row.kind}@${row.epoch}`)
        .sort()
    ).toEqual(["password@1", "recovery@1"])
    expect(vault.epoch).toBe(1)
    expect(vault.recoveryKey).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/)
  })

  it("opens again with the password", async () => {
    const { server, vault } = await signedUp()

    expect((await unlock(server.client, PASSWORD)).contentKey).toEqual(vault.contentKey)
  })

  it("opens with the recovery key it showed", async () => {
    const { server, vault } = await signedUp()
    const recovery = server.rows().find((row) => row.kind === "recovery")

    expect(await unlockWithRecoveryKey(vault.recoveryKey, recovery!)).toEqual(vault.contentKey)
  })

  /*
   * The credential lands and the envelopes do not. An account with no vault is
   * a state rather than a failure, because the account is real and the next
   * visit can finish the job.
   */
  it("leaves an account with no vault when the second write fails, and finishes it later", async () => {
    const server = fakeServer()
    server.refuseWrites(true)

    await expect(server.client.signUp(EMAIL, PASSWORD, "Mark")).rejects.toThrow(VaultRequestError)
    expect(await server.client.signIn(EMAIL, PASSWORD)).toEqual({ state: "no vault" })

    server.refuseWrites(false)
    const vault = await server.client.mintVault(EMAIL, PASSWORD)

    expect(vault.epoch).toBe(1)
    expect((await unlock(server.client, PASSWORD)).contentKey).toEqual(vault.contentKey)
  })
})

describe("after a password reset", () => {
  /*
   * The case that reads as a bug and is not: the credential was replaced and
   * the envelope could not be, because the server has never held the key to
   * re-wrap it.
   */
  it("signs in and reports the vault locked", async () => {
    const { server } = await signedUp()
    await server.resetPasswordTo(NEXT)

    expect(await server.client.signIn(EMAIL, NEXT)).toEqual({ state: "locked" })
  })

  it("resets through the client, leaving the vault locked until the recovery key", async () => {
    const { server, vault } = await signedUp()

    await server.client.resetPassword(EMAIL, NEXT, RESET_TOKEN)

    // The credential moved; the envelope did not. Locked is the correct outcome here,
    // and the reason the reset mail tells people to have their recovery key ready.
    expect(await server.client.signIn(EMAIL, NEXT)).toEqual({ state: "locked" })

    const opened = await server.client.recoverAfterReset(EMAIL, NEXT, vault.recoveryKey)
    expect(opened.contentKey).toEqual(vault.contentKey)
  })

  it("refuses a reset whose token is not the one that was issued", async () => {
    const { server } = await signedUp()

    await expect(server.client.resetPassword(EMAIL, NEXT, "stale")).rejects.toThrow(
      "That link has expired"
    )
    // The old password still works, so a refused reset changed nothing.
    expect(await server.canSignIn(PASSWORD)).toBe(true)
  })

  it("opens with the recovery key, and the new password works from then on", async () => {
    const { server, vault } = await signedUp()
    await server.resetPasswordTo(NEXT)
    await server.client.signIn(EMAIL, NEXT)

    const opened = await server.client.recoverAfterReset(EMAIL, NEXT, vault.recoveryKey)

    expect(opened.contentKey).toEqual(vault.contentKey)
    expect((await unlock(server.client, NEXT)).contentKey).toEqual(vault.contentKey)
  })

  it("leaves the recovery key working afterwards", async () => {
    const { server, vault } = await signedUp()
    await server.resetPasswordTo(NEXT)
    await server.client.signIn(EMAIL, NEXT)
    await server.client.recoverAfterReset(EMAIL, NEXT, vault.recoveryKey)

    const recovery = server.rows().find((row) => row.kind === "recovery")
    expect(await unlockWithRecoveryKey(vault.recoveryKey, recovery!)).toEqual(vault.contentKey)
  })

  it("refuses a recovery key that is not the one", async () => {
    const { server } = await signedUp()
    await server.resetPasswordTo(NEXT)
    await server.client.signIn(EMAIL, NEXT)

    await expect(
      server.client.recoverAfterReset(EMAIL, NEXT, "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF")
    ).rejects.toThrow()
  })

  /*
   * A new content key at a new epoch. The old envelopes stay, so a recovery key
   * found in a drawer next year still opens the notes it was made for.
   */
  it("starts fresh at a new epoch without disturbing the old one", async () => {
    const { server, vault } = await signedUp()
    await server.resetPasswordTo(NEXT)
    await server.client.signIn(EMAIL, NEXT)

    const fresh = await server.client.mintVault(EMAIL, NEXT)

    expect(fresh.epoch).toBe(2)
    expect(fresh.contentKey).not.toEqual(vault.contentKey)

    const oldRecovery = server.rows().find((row) => row.kind === "recovery" && row.epoch === 1)
    expect(await unlockWithRecoveryKey(vault.recoveryKey, oldRecovery!)).toEqual(vault.contentKey)
  })
})

describe("changing a password", () => {
  it("re-wraps the same content key, and only the new password signs in", async () => {
    const { server, vault } = await signedUp()

    await server.client.changePassword(EMAIL, PASSWORD, NEXT, vault)

    expect(await server.canSignIn(PASSWORD)).toBe(false)
    expect((await unlock(server.client, NEXT)).contentKey).toEqual(vault.contentKey)
  })

  it("refuses when the current password is wrong, and changes nothing", async () => {
    const { server, vault } = await signedUp()

    await expect(server.client.changePassword(EMAIL, "not it", NEXT, vault)).rejects.toThrow()
    expect((await unlock(server.client, PASSWORD)).contentKey).toEqual(vault.contentKey)
  })

  /*
   * The reason the credential is written first.
   *
   * Half done, the new password signs in and the envelope is still sealed under
   * the old one — so the old password, which the reader has just typed, is
   * enough to open the vault and finish. The other order would leave them shut
   * out at the door with no screen to type anything into.
   */
  it("is recoverable with the old password when the envelope write fails", async () => {
    const { server, vault } = await signedUp()
    server.refuseWrites(true)

    await expect(server.client.changePassword(EMAIL, PASSWORD, NEXT, vault)).rejects.toThrow(
      VaultRequestError
    )
    server.refuseWrites(false)

    expect(await server.client.signIn(EMAIL, NEXT)).toEqual({ state: "locked" })
    const opened = await server.client.unlockWithOldPassword(PASSWORD)
    expect(opened.contentKey).toEqual(vault.contentKey)

    // And the change finishes from there, with nothing but what was remembered.
    await server.client.changePassword(EMAIL, NEXT, NEXT, opened)
    expect((await unlock(server.client, NEXT)).contentKey).toEqual(vault.contentKey)
  })
})

describe("replacing a recovery key", () => {
  it("shows a new one that opens the same vault", async () => {
    const { server, vault } = await signedUp()

    const replacement = await server.client.rotateRecoveryKey(vault)
    const recovery = server.rows().find((row) => row.kind === "recovery")

    expect(replacement).not.toBe(vault.recoveryKey)
    expect(await unlockWithRecoveryKey(replacement, recovery!)).toEqual(vault.contentKey)
  })

  it("leaves the old one unable to open what the server now serves", async () => {
    const { server, vault } = await signedUp()

    await server.client.rotateRecoveryKey(vault)
    const recovery = server.rows().find((row) => row.kind === "recovery")

    await expect(unlockWithRecoveryKey(vault.recoveryKey, recovery!)).rejects.toThrow()
  })

  it("leaves the password working", async () => {
    const { server, vault } = await signedUp()

    await server.client.rotateRecoveryKey(vault)

    expect((await unlock(server.client, PASSWORD)).contentKey).toEqual(vault.contentKey)
  })
})

describe("when the server will not say", () => {
  /*
   * The status is the assertion, not the error type. A refused read that came
   * back as an empty list would reach the same `VaultRequestError` by a
   * different route — the one that means "there is no envelope here" — and a
   * reader whose session had merely expired would be sent to start a fresh
   * vault over the top of one they can still open. Asserting only the type
   * passed that tamper.
   */
  it("says the read was refused, not that the vault is empty", async () => {
    const { server } = await signedUp()
    server.signOut()

    await expect(server.client.unlockWithOldPassword(PASSWORD)).rejects.toMatchObject({
      name: "VaultRequestError",
      status: 401
    })
  })

  it("will not mint a vault over one it could not read", async () => {
    const { server } = await signedUp()
    server.signOut()

    await expect(server.client.mintVault(EMAIL, PASSWORD)).rejects.toMatchObject({ status: 401 })
    expect(server.rows()).toHaveLength(2)
  })
})

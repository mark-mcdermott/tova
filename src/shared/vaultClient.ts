/**
 * The flows the auth screens drive, with the crypto and the HTTP in one place.
 *
 * `vaultSetup.ts` is the cryptography and knows nothing about a server;
 * `envelopes.ts` is the wire format. This is the orchestration between them —
 * what order two writes go in, which failures are states rather than errors,
 * and what is left to show when something does not open.
 *
 * Everything here runs on the device. What leaves is an auth secret and sealed
 * envelopes, and `docs/SYNC.md` is the model.
 */

import {
  currentEpoch,
  envelopeFor,
  envelopesResponse,
  nextEpoch,
  type EnvelopeKind,
  type StoredEnvelope
} from "./envelopes"
import {
  authSecretFor,
  prepareVault,
  replaceRecoveryKey,
  reWrapForPassword,
  unlockWithPassword,
  unlockWithRecoveryKey,
  type SealedFactor
} from "./vaultSetup"

/** An open vault: the key to decrypt with, and which epoch it belongs to. */
export type OpenVault = { contentKey: Uint8Array<ArrayBuffer>; epoch: number }

/**
 * Where a sign-in ended up.
 *
 * Three outcomes rather than a key or an error, because two of the three are
 * ordinary states with a screen behind them.
 *
 * `locked` is the one worth naming carefully: the credential was accepted and
 * the envelope did not open. The password changed without the envelope
 * following — a reset, almost always — and the way out is the recovery key, or
 * the old password if they still have it. "Your password worked and your notes
 * are still shut" is otherwise indistinguishable from a bug, which is why it is
 * a case here rather than a thrown error.
 */
export type SignedIn =
  | ({ state: "unlocked" } & OpenVault)
  /** Signed in with nothing stored: a signup that stopped halfway. */
  | { state: "no vault" }
  | { state: "locked" }

/** What a new vault hands back, including the one thing shown only once. */
export type NewVaultResult = OpenVault & { recoveryKey: string }

/**
 * The credential half, which Better Auth owns.
 *
 * An interface rather than a direct import so the flows below can be tested
 * without a server — they are the part worth testing, and a test that needed
 * Better Auth running would be testing Better Auth.
 *
 * Nothing here is given a password. What it receives is the auth secret from
 * `deriveAccountKeys`, one half of a split whose other half never leaves the
 * device.
 */
export type Credentials = {
  signUp(email: string, secret: string, name: string): Promise<void>
  signIn(email: string, secret: string): Promise<void>
  changeSecret(current: string, next: string): Promise<void>
  /** Asks for the reset mail. No crypto here — it is routed through the port so this stays the only file that knows Better Auth. */
  requestReset(email: string): Promise<void>
  /**
   * Sets a new secret from an emailed token, with no current secret to prove.
   *
   * Separate from `changeSecret` because the thing it cannot do is the point: a reset
   * replaces the credential and leaves the envelopes untouched, so the notes stay sealed
   * under a wrapping key nobody now holds. `recoverAfterReset` is what re-opens them.
   */
  resetSecret(token: string, secret: string): Promise<void>
}

export type VaultClient = {
  signUp(email: string, password: string, name: string): Promise<NewVaultResult>
  signIn(email: string, password: string): Promise<SignedIn>
  /** Asks for the reset mail. Pass-through to the port, so a form never reaches past the client. */
  requestReset(email: string): Promise<void>
  /**
   * Completes an emailed reset. Derives the new auth secret here, because the server is
   * never given a password — only the `auth` half of the split (`accountKeys.ts`).
   *
   * Signing in afterwards reports `locked`, which is correct and not a failure: the
   * password envelope still belongs to the old password. `recoverAfterReset` takes it
   * from there with the recovery key.
   */
  resetPassword(email: string, password: string, token: string): Promise<void>
  mintVault(email: string, password: string): Promise<NewVaultResult>
  unlockWithOldPassword(oldPassword: string): Promise<OpenVault>
  recoverAfterReset(email: string, password: string, recoveryKey: string): Promise<OpenVault>
  changePassword(email: string, current: string, next: string, vault: OpenVault): Promise<void>
  reWrapPassword(email: string, password: string, vault: OpenVault): Promise<void>
  rotateRecoveryKey(vault: OpenVault): Promise<string>
}

/** Thrown when the server refused for a reason no screen has a case for. */
export class VaultRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "VaultRequestError"
  }
}

const ENVELOPES = "/api/vault/envelopes"

type Fetch = typeof globalThis.fetch

export function makeVaultClient(credentials: Credentials, fetch: Fetch): VaultClient {
  function send(method: string, body?: unknown): Promise<Response> {
    return fetch(ENVELOPES, {
      method,
      headers: { "content-type": "application/json" },
      // Same origin, so the session cookie rides along on its own. Named
      // anyway: a fetch default that changes is a silent sign-out.
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  }

  async function read(): Promise<StoredEnvelope[]> {
    const response = await send("GET")
    if (!response.ok) throw new VaultRequestError(response.status, "Could not read the envelopes")

    return envelopesResponse.parse(await response.json()).envelopes
  }

  /** One factor, re-sealed over the same content key. */
  async function replace(kind: EnvelopeKind, epoch: number, factor: SealedFactor): Promise<void> {
    const response = await send("PUT", { kind, epoch, ...factor })
    if (!response.ok) {
      throw new VaultRequestError(response.status, `Could not store the new ${kind} key`)
    }
  }

  /** Both envelopes at an epoch, which is the only way a content key is stored. */
  async function create(
    epoch: number,
    envelopes: { password: SealedFactor; recovery: SealedFactor }
  ): Promise<void> {
    const response = await send("POST", { epoch, ...envelopes })
    if (!response.ok) {
      throw new VaultRequestError(response.status, "Could not store the new keys")
    }
  }

  /** The epoch and the password envelope currently in force, or a refusal. */
  async function currentPasswordEnvelope(): Promise<{ epoch: number; sealed: StoredEnvelope }> {
    const envelopes = await read()
    const epoch = currentEpoch(envelopes)
    const sealed = epoch === null ? null : envelopeFor(envelopes, "password", epoch)
    if (epoch === null || sealed === null) {
      throw new VaultRequestError(404, "There is no password envelope to open")
    }

    return { epoch, sealed }
  }

  return {
    /**
     * An account and a vault, in that order.
     *
     * The credential first, because the envelopes cannot be stored without a
     * session to store them under. If the second write fails the account exists
     * with no vault — which is why that is a state `signIn` reports rather than
     * something to unwind here, and why `mintVault` can complete it on the next
     * visit.
     */
    async signUp(email, password, name) {
      const vault = await prepareVault(email, password)
      await credentials.signUp(email, vault.authSecret, name)
      await create(1, vault.envelopes)

      return { contentKey: vault.contentKey, recoveryKey: vault.recoveryKey, epoch: 1 }
    },

    async requestReset(email) {
      await credentials.requestReset(email)
    },

    async resetPassword(email, password, token) {
      await credentials.resetSecret(token, await authSecretFor(email, password))
    },

    async signIn(email, password) {
      await credentials.signIn(email, await authSecretFor(email, password))

      const envelopes = await read()
      const epoch = currentEpoch(envelopes)
      if (epoch === null) return { state: "no vault" }

      const sealed = envelopeFor(envelopes, "password", epoch)
      if (sealed === null) return { state: "locked" }

      try {
        return { state: "unlocked", contentKey: await unlockWithPassword(password, sealed), epoch }
      } catch {
        return { state: "locked" }
      }
    },

    /**
     * A content key at the next epoch, which two screens both arrive at.
     *
     * One is the signup that stopped after the account was made: there are no
     * envelopes, the next epoch is 1, and this is the vault that was missing.
     * The other is starting fresh after a recovery key is gone for good.
     *
     * Those read as opposites and are the same operation, because an epoch is
     * only ever "the next one". Starting fresh leaves the old notes exactly
     * where they are, sealed, carrying the old epoch — not deleted, since the
     * entire premise of a recovery key is that people find things late, and
     * deleting would be the one irreversible step taken on their behalf on the
     * screen whose whole message is that nothing can be done for them.
     */
    async mintVault(email, password) {
      const epoch = nextEpoch(await read())
      const vault = await prepareVault(email, password)
      await create(epoch, vault.envelopes)

      return { contentKey: vault.contentKey, recoveryKey: vault.recoveryKey, epoch }
    },

    /**
     * The way out of `locked` that needs no recovery key.
     *
     * A password change writes the credential first, so one that stopped
     * halfway leaves the envelope sealed under the *old* password while the new
     * one signs in. Someone who still remembers the old one opens the vault
     * with it, and the change finishes — which is the whole reason that order
     * was chosen over the other.
     */
    async unlockWithOldPassword(oldPassword) {
      const { epoch, sealed } = await currentPasswordEnvelope()

      return { contentKey: await unlockWithPassword(oldPassword, sealed), epoch }
    },

    /**
     * The recovery key, used for what it is for.
     *
     * A reset leaves somebody with a working credential and no way to read
     * anything, because the server cannot re-wrap an envelope it has never held
     * the key to. This unwraps with the recovery key and seals the same content
     * key under the password they just set. Their recovery key keeps working:
     * it is the other envelope, and it is not touched.
     */
    async recoverAfterReset(email, password, recoveryKey) {
      const envelopes = await read()
      const epoch = currentEpoch(envelopes)
      const sealed = epoch === null ? null : envelopeFor(envelopes, "recovery", epoch)
      if (epoch === null || sealed === null) {
        throw new VaultRequestError(404, "There is no recovery envelope to open")
      }

      const contentKey = await unlockWithRecoveryKey(recoveryKey, sealed)
      const { factor } = await reWrapForPassword(email, password, contentKey)
      await replace("password", epoch, factor)

      return { contentKey, epoch }
    },

    /**
     * A password change, which is two writes in two systems.
     *
     * No transaction spans them, so the order is chosen for which half-done
     * state is easier to get out of. **Credential first.**
     *
     * Stopping after the credential leaves the new password signing in and the
     * envelope still sealed under the old one, which the reader's own old
     * password opens — so `unlockWithOldPassword` finishes it with nothing but
     * what they remember.
     *
     * The other order is worse for the same reason reversed: the envelope would
     * be sealed under a password that does not sign in yet, turning the reader
     * away at the door with no screen to put anything into.
     *
     * The content key is passed in because the caller holds it already. Nothing
     * here derives or re-reads it, so the envelope write can be retried for as
     * long as it takes.
     */
    async changePassword(email, current, next, vault) {
      const [currentSecret, resealed] = await Promise.all([
        authSecretFor(email, current),
        reWrapForPassword(email, next, vault.contentKey)
      ])

      await credentials.changeSecret(currentSecret, resealed.authSecret)
      await replace("password", vault.epoch, resealed.factor)
    },

    /**
     * The envelope catching up to a credential that already changed.
     *
     * What finishes a password change that stopped after its first write. The
     * credential is already the new one, so there is nothing to change about
     * it — going back through `changePassword` would ask Better Auth to replace
     * a password with itself, which is a no-op it is under no obligation to
     * accept. One write, and it can be retried until it lands.
     */
    async reWrapPassword(email, password, vault) {
      const { factor } = await reWrapForPassword(email, password, vault.contentKey)
      await replace("password", vault.epoch, factor)
    },

    /**
     * A new recovery key over the same content key, shown once.
     *
     * Revocation by deletion rather than by cryptography: the old key still
     * derives the old wrapping key forever, and what ends is the server serving
     * the envelope it opens. Fine as a product decision, and not a claim to
     * make on a privacy page.
     */
    async rotateRecoveryKey(vault) {
      const { recoveryKey, factor } = await replaceRecoveryKey(vault.contentKey)
      await replace("recovery", vault.epoch, factor)

      return recoveryKey
    }
  }
}

/**
 * The shapes the envelope endpoints carry.
 *
 * Shared, because the client builds what the server parses. What travels is
 * always a sealed envelope and a salt — never a key, never a password, and
 * never anything the server could derive one from.
 */

import { z } from "zod"

/** Which factor opens an envelope. The two are equals over one content key. */
export const envelopeKind = z.enum(["password", "recovery"])
export type EnvelopeKind = z.infer<typeof envelopeKind>

const SALT = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64")

/** A sealed content key, and the salt its factor was derived with. */
export const envelope = z.object({
  kind: envelopeKind,
  salt: SALT,
  /** `TOVA-ENCRYPTED-V1`, as `seal` writes it. */
  envelope: z.string().startsWith("TOVA-ENCRYPTED-V1\n")
})
export type Envelope = z.infer<typeof envelope>

const EPOCH = z.number().int().min(1)

/**
 * Both envelopes at once, which is the only way they are ever created.
 *
 * One at a time would allow an account with a password envelope and no
 * recovery envelope — an account with exactly one way in and no way back,
 * which is the state the recovery key exists to prevent.
 *
 * `epoch` is an assertion rather than an address: the server works out which
 * epoch comes next and refuses a request that names a different one. Sending
 * it is what makes a double-submitted signup a refusal instead of a second
 * content key, and what makes two devices starting fresh at once visible to
 * the one that loses.
 */
export const createEnvelopes = z.object({
  epoch: EPOCH,
  password: envelope.omit({ kind: true }),
  recovery: envelope.omit({ kind: true })
})

/**
 * One factor's envelope, re-sealed over the same content key.
 *
 * What a password change, a recovery after reset and a new recovery key all
 * come down to. The content key does not change, so no note is touched and the
 * epoch stays exactly where it is — `kind` and `epoch` together are the address
 * of the row being overwritten, not something the request gets to move.
 *
 * One factor at a time, because every flow that uses this changes one. The
 * other envelope still opens the same content key, which is the property that
 * makes a password change recoverable if it fails halfway.
 */
export const replaceEnvelope = envelope.extend({ epoch: EPOCH })
export type ReplaceEnvelope = z.infer<typeof replaceEnvelope>

export const storedEnvelope = envelope.extend({ epoch: EPOCH })
export type StoredEnvelope = z.infer<typeof storedEnvelope>

export const envelopesResponse = z.object({ envelopes: z.array(storedEnvelope) })

/**
 * The epoch to read, which is the highest one with a full pair.
 *
 * Highest rather than only, because starting fresh after a lost recovery key
 * leaves older epochs in place — a key found later still opens the notes it was
 * made for. A pair rather than any envelope, because a half-written epoch is
 * not something to send somebody into.
 */
export function currentEpoch(envelopes: StoredEnvelope[]): number | null {
  const complete = envelopes.reduce<Map<number, Set<EnvelopeKind>>>((found, row) => {
    const kinds = found.get(row.epoch) ?? new Set<EnvelopeKind>()
    kinds.add(row.kind)
    return found.set(row.epoch, kinds)
  }, new Map())

  const epochs = [...complete.entries()]
    .filter(([, kinds]) => kinds.has("password") && kinds.has("recovery"))
    .map(([epoch]) => epoch)

  return epochs.length === 0 ? null : Math.max(...epochs)
}

/**
 * The epoch a new content key would take.
 *
 * Every epoch present, not only the complete ones: a half-written epoch is not
 * a number to hand out again, and taking the maximum of the complete pairs
 * would do exactly that.
 */
export function nextEpoch(envelopes: StoredEnvelope[]): number {
  return envelopes.reduce((highest, row) => Math.max(highest, row.epoch), 0) + 1
}

/** The envelope for one factor at one epoch, or null. */
export function envelopeFor(
  envelopes: StoredEnvelope[],
  kind: EnvelopeKind,
  epoch: number
): StoredEnvelope | null {
  return envelopes.find((row) => row.kind === kind && row.epoch === epoch) ?? null
}

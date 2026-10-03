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

/**
 * Both envelopes at once, which is the only way they are ever created.
 *
 * One at a time would allow an account with a password envelope and no
 * recovery envelope — an account with exactly one way in and no way back,
 * which is the state the recovery key exists to prevent.
 */
export const createEnvelopes = z.object({
  password: envelope.omit({ kind: true }),
  recovery: envelope.omit({ kind: true })
})

export const storedEnvelope = envelope.extend({ epoch: z.number().int().min(1) })
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

/** The envelope for one factor at one epoch, or null. */
export function envelopeFor(
  envelopes: StoredEnvelope[],
  kind: EnvelopeKind,
  epoch: number
): StoredEnvelope | null {
  return envelopes.find((row) => row.kind === kind && row.epoch === epoch) ?? null
}

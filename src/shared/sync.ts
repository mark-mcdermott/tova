/**
 * The two calls sync is made of, and the shapes they carry.
 *
 * Shared because the client builds what the server parses, and a drift between
 * the two is the kind of bug that shows up as somebody's note not arriving. One
 * definition, both ends.
 *
 * Nothing here can read a note. The client encrypts before it builds a row and
 * decrypts after it reads one, so these schemas only ever see the blob.
 * `docs/SYNC.md` is the model.
 */

import { z } from "zod"

/**
 * Base64 of a 12-byte GCM nonce: 16 characters, and no padding.
 *
 * Twelve bytes divide into four groups of three exactly, so base64 has nothing
 * left over to pad. This said `{15}=` and described an *eleven*-byte nonce —
 * which `seal` has never produced, so the endpoint would have refused every
 * genuine push with a 400.
 *
 * It survived a live run against the database because the probe hand-wrote a
 * nonce to match this pattern instead of sealing anything. `sync.test.ts` now
 * puts real `seal` output through it, which is the only version of this check
 * that can go wrong in the same direction as the code.
 */
const NONCE = z.string().regex(/^[A-Za-z0-9+/]{16}$/, "a 12-byte nonce in base64")

const CIPHERTEXT = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64")

/**
 * A note as it travels: an id, a blob, and when it died.
 *
 * `version` is absent going up and present coming down — the client does not
 * get to choose one, because the server's counter is what orders a pull.
 */
export const syncedNote = z.object({
  id: z.uuid(),
  ciphertext: CIPHERTEXT,
  nonce: NONCE,
  /** Set when the note was deleted. The row still travels; that is the point. */
  deletedAt: z.iso.datetime().nullable().default(null)
})
export type SyncedNote = z.infer<typeof syncedNote>

export const pullRequest = z.object({
  /** Everything above this. Zero on a first sync, which asks for all of it. */
  cursor: z.coerce.bigint().min(0n),
  /** A ceiling, so one reply cannot be unbounded. */
  limit: z.number().int().min(1).max(500).default(100)
})

export const pullResponse = z.object({
  notes: z.array(syncedNote.extend({ version: z.coerce.bigint() })),
  /** Where to resume. Equal to the cursor sent when nothing has changed. */
  cursor: z.coerce.bigint(),
  /** Whether another page is waiting, so a client knows to come straight back. */
  more: z.boolean()
})
export type PullResponse = z.infer<typeof pullResponse>

/**
 * One note going up, with the version it was edited from.
 *
 * `baseVersion` is the whole of the conflict story. Null means "this note is
 * new and the server has never seen it"; a number means "I read version n, and
 * if that is no longer current then someone else wrote in between".
 */
export const pushedNote = syncedNote.extend({
  baseVersion: z.coerce.bigint().min(0n).nullable()
})
export type PushedNote = z.infer<typeof pushedNote>

export const pushRequest = z.object({
  notes: z.array(pushedNote).min(1).max(500)
})

/**
 * What became of each pushed note, one by one.
 *
 * Refusals carry the row that won, so a client can merge without going back
 * for it — a conflict already costs a round trip and should not cost two.
 */
export const pushResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("accepted"), id: z.uuid(), version: z.coerce.bigint() }),
  z.object({
    status: z.literal("conflict"),
    id: z.uuid(),
    current: syncedNote.extend({ version: z.coerce.bigint() })
  }),
  /*
   * Refused, and there is nothing to merge against.
   *
   * A base version was given for a note this vault does not have — deleted and
   * swept, or an id belonging to somebody else. Distinct from a conflict
   * because there is no winning row to hand back, and a client that treated it
   * as one would be merging against nothing.
   */
  z.object({ status: z.literal("missing"), id: z.uuid() })
])
export type PushResult = z.infer<typeof pushResult>

export const pushResponse = z.object({ results: z.array(pushResult) })

/** Whether a push was refused for any reason at all. */
export function isRefused(result: PushResult): boolean {
  return result.status !== "accepted"
}

/** Whether a push was refused because somebody else got there first. */
export function isConflict(
  result: PushResult
): result is Extract<PushResult, { status: "conflict" }> {
  return result.status === "conflict"
}

/**
 * The cursor to resume from after a page.
 *
 * The server's, not the highest version seen: a page can come back empty, and
 * taking the maximum of nothing would send the client back to zero and pull
 * the whole vault again.
 */
export function nextCursor(response: PullResponse): bigint {
  return response.cursor
}

/**
 * Whether a pull has reached the end.
 *
 * Both halves, because either alone is wrong: a full page can still be the
 * last one, and an empty page with `more` set is a server with another page of
 * tombstones to hand over.
 */
export function isCaughtUp(response: PullResponse): boolean {
  return !response.more
}

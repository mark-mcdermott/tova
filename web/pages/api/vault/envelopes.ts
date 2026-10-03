import type { APIRoute } from "astro"
import { and, eq } from "drizzle-orm"
import { getDb } from "../../../../src/server/db"
import { keyEnvelopes } from "../../../../src/server/db/schema"
import { callerOf, unauthorized } from "../../../../src/server/session"
import {
  createEnvelopes,
  nextEpoch,
  replaceEnvelope,
  type StoredEnvelope
} from "../../../../src/shared/envelopes"

export const prerender = false

/** Every envelope this reader has, across every epoch. */
async function envelopesOf(userId: string): Promise<StoredEnvelope[]> {
  return getDb()
    .select({
      kind: keyEnvelopes.kind,
      salt: keyEnvelopes.salt,
      envelope: keyEnvelopes.envelope,
      epoch: keyEnvelopes.epoch
    })
    .from(keyEnvelopes)
    .where(eq(keyEnvelopes.userId, userId))
}

/**
 * The sealed content key, once per factor.
 *
 * Every row is scoped to the session's user and never to an id from the
 * request. That is the whole of the access control here, and it is why the
 * caller is resolved before the database is touched rather than alongside it.
 *
 * What travels is a sealed envelope and a salt. No key, no password, and
 * nothing the server could derive either from.
 */
export const GET: APIRoute = async ({ request }) => {
  const caller = await callerOf(request)
  if (caller === null) return unauthorized()

  return Response.json({ envelopes: await envelopesOf(caller.userId) })
}

/**
 * Both envelopes for a new content key, written together.
 *
 * Together because one at a time allows an account with a password envelope and
 * no recovery envelope — one way in and no way back, which is the state the
 * recovery key exists to prevent.
 *
 * Which epoch is the server's to decide: the next one after everything this
 * reader already has. The epoch in the request is an assertion about what the
 * client believed, and a mismatch is refused rather than obeyed — a signup
 * submitted twice asserts 1 twice and is turned away the second time, instead
 * of minting a second content key that would hide every note written under the
 * first.
 */
export const POST: APIRoute = async ({ request }) => {
  const caller = await callerOf(request)
  if (caller === null) return unauthorized()

  const parsed = createEnvelopes.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "That is not a pair of envelopes" }, { status: 400 })
  }

  const { epoch, password, recovery } = parsed.data
  const expected = nextEpoch(await envelopesOf(caller.userId))

  if (epoch !== expected) {
    return Response.json({ error: "That epoch is already taken", epoch: expected }, { status: 409 })
  }

  /*
   * Two guards against two different failures, and neither covers the other.
   *
   * The check above stops an epoch being *named*. Without it a request
   * asserting 999 is obeyed, and every client then reads 999 as current and
   * sees none of the notes written under 1 — a lockout in one request, which
   * is what the old "this vault already has its keys" refusal was for.
   *
   * The unique index stops two requests *racing* for the same next epoch:
   * both read the same `expected`, both pass the check, and only one inserts.
   */
  try {
    await getDb()
      .insert(keyEnvelopes)
      .values([
        { userId: caller.userId, kind: "password", epoch, ...password },
        { userId: caller.userId, kind: "recovery", epoch, ...recovery }
      ])
  } catch {
    return Response.json({ error: "That epoch is already taken", epoch }, { status: 409 })
  }

  return Response.json({ created: true, epoch }, { status: 201 })
}

/**
 * One factor re-sealed over the same content key.
 *
 * A password change, a recovery after a reset, and a new recovery key are all
 * this one call. The content key is untouched, so no note is re-encrypted and
 * the epoch does not move.
 *
 * `kind` and `epoch` address a row that must already exist. An update matching
 * nothing is refused rather than turned into an insert: inserting would create
 * a factor at an epoch whose other half may not be there, which is the
 * half-written state `POST` writes both envelopes at once to avoid.
 */
export const PUT: APIRoute = async ({ request }) => {
  const caller = await callerOf(request)
  if (caller === null) return unauthorized()

  const parsed = replaceEnvelope.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "That is not an envelope" }, { status: 400 })
  }

  const { kind, epoch, salt, envelope } = parsed.data

  /*
   * The caller is part of the `where` rather than checked beforehand. Reading
   * the row first and comparing its `user_id` in TypeScript would be two
   * statements with a gap between them; this is one, and it cannot match
   * somebody else's envelope.
   */
  const written = await getDb()
    .update(keyEnvelopes)
    .set({ salt, envelope })
    .where(
      and(
        eq(keyEnvelopes.userId, caller.userId),
        eq(keyEnvelopes.kind, kind),
        eq(keyEnvelopes.epoch, epoch)
      )
    )
    .returning({ kind: keyEnvelopes.kind, epoch: keyEnvelopes.epoch })

  if (written.length === 0) {
    return Response.json({ error: "No such envelope" }, { status: 404 })
  }

  return Response.json({ replaced: written[0] })
}

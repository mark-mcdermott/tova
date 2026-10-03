import type { APIRoute } from "astro"
import { and, eq } from "drizzle-orm"
import { getDb } from "../../../../src/server/db"
import { keyEnvelopes } from "../../../../src/server/db/schema"
import { callerOf, unauthorized } from "../../../../src/server/session"
import { createEnvelopes, type StoredEnvelope } from "../../../../src/shared/envelopes"

export const prerender = false

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

  const rows = await getDb()
    .select({
      kind: keyEnvelopes.kind,
      salt: keyEnvelopes.salt,
      envelope: keyEnvelopes.envelope,
      epoch: keyEnvelopes.epoch
    })
    .from(keyEnvelopes)
    .where(eq(keyEnvelopes.userId, caller.userId))

  return Response.json({ envelopes: rows satisfies StoredEnvelope[] })
}

/**
 * Both envelopes for a new vault, written together.
 *
 * Together because one at a time allows an account with a password envelope and
 * no recovery envelope — one way in and no way back, which is the state the
 * recovery key exists to prevent.
 *
 * Refused if this reader already has an epoch 1. Creating is not replacing: a
 * second POST overwriting the first would be a way to lock somebody out of
 * their own notes with a single request.
 */
export const POST: APIRoute = async ({ request }) => {
  const caller = await callerOf(request)
  if (caller === null) return unauthorized()

  const parsed = createEnvelopes.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "That is not a pair of envelopes" }, { status: 400 })
  }

  const db = getDb()
  const existing = await db
    .select({ epoch: keyEnvelopes.epoch })
    .from(keyEnvelopes)
    .where(and(eq(keyEnvelopes.userId, caller.userId), eq(keyEnvelopes.epoch, 1)))
    .limit(1)

  if (existing.length > 0) {
    return Response.json({ error: "This vault already has its keys" }, { status: 409 })
  }

  const { password, recovery } = parsed.data
  await db.insert(keyEnvelopes).values([
    { userId: caller.userId, kind: "password", epoch: 1, ...password },
    { userId: caller.userId, kind: "recovery", epoch: 1, ...recovery }
  ])

  return Response.json({ created: true }, { status: 201 })
}

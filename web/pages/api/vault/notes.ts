import type { APIRoute } from "astro"
import { and, asc, eq, gt, sql } from "drizzle-orm"
import { getDb } from "../../../../src/server/db"
import { notes } from "../../../../src/server/db/schema"
import { callerOf, unauthorized } from "../../../../src/server/session"
import { pullRequest, pushRequest, type PushResult } from "../../../../src/shared/sync"

export const prerender = false

/** The next version, from the sequence rather than from a read. */
const nextVersion = sql`nextval('note_version')`

/**
 * Everything of mine above a cursor, oldest first.
 *
 * Tombstones travel with the rest — a row absent from a pull is
 * indistinguishable from one that never existed, and the other device would
 * push it straight back.
 */
export const GET: APIRoute = async ({ request }) => {
  const caller = await callerOf(request)
  if (caller === null) return unauthorized()

  const url = new URL(request.url)
  const asked = pullRequest.safeParse({
    cursor: url.searchParams.get("cursor") ?? 0,
    limit: Number(url.searchParams.get("limit") ?? 100)
  })
  if (!asked.success) return Response.json({ error: "Bad cursor or limit" }, { status: 400 })

  const { cursor, limit } = asked.data
  // One more than asked for, so `more` is known without a second count.
  const rows = await getDb()
    .select({
      id: notes.id,
      ciphertext: notes.ciphertext,
      nonce: notes.nonce,
      deletedAt: notes.deletedAt,
      version: notes.version,
      epoch: notes.epoch
    })
    .from(notes)
    .where(and(eq(notes.userId, caller.userId), gt(notes.version, cursor)))
    .orderBy(asc(notes.version))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  return Response.json({
    notes: page.map((row) => ({
      ...row,
      version: String(row.version),
      deletedAt: row.deletedAt?.toISOString() ?? null
    })),
    // The last version handed over, or the cursor unchanged when nothing was.
    cursor: String(page.at(-1)?.version ?? cursor),
    more: rows.length > limit
  })
}

/**
 * Notes going up, each with the version it was edited from.
 *
 * The conflict check is the `where` clause rather than a read followed by a
 * write: `version = baseVersion` either matches and updates in one statement,
 * or matches nothing and the row moved on. Reading first and comparing in
 * TypeScript would be two statements with a gap between them, which is where
 * one device would overwrite another's edit.
 */
export const POST: APIRoute = async ({ request }) => {
  const caller = await callerOf(request)
  if (caller === null) return unauthorized()

  const asked = pushRequest.safeParse(await request.json().catch(() => null))
  if (!asked.success) return Response.json({ error: "That is not a push" }, { status: 400 })

  const db = getDb()
  const results: PushResult[] = []

  for (const note of asked.data.notes) {
    const values = {
      ciphertext: note.ciphertext,
      nonce: note.nonce,
      deletedAt: note.deletedAt === null ? null : new Date(note.deletedAt),
      version: nextVersion,
      updatedAt: new Date()
    }

    const written =
      note.baseVersion === null
        ? // New here. `onConflictDoNothing` rather than an upsert: a second
          // client creating the same id is a conflict, not an overwrite.
          await db
            .insert(notes)
            .values({ id: note.id, userId: caller.userId, ...values })
            .onConflictDoNothing()
            .returning({ version: notes.version })
        : await db
            .update(notes)
            .set(values)
            .where(
              and(
                eq(notes.id, note.id),
                eq(notes.userId, caller.userId),
                eq(notes.version, note.baseVersion)
              )
            )
            .returning({ version: notes.version })

    if (written.length > 0) {
      results.push({ status: "accepted", id: note.id, version: written[0].version })
      continue
    }

    // Refused. The winning row travels back with it, so a merge costs one
    // round trip rather than two.
    const [current] = await db
      .select({
        id: notes.id,
        ciphertext: notes.ciphertext,
        nonce: notes.nonce,
        deletedAt: notes.deletedAt,
        version: notes.version
      })
      .from(notes)
      .where(and(eq(notes.id, note.id), eq(notes.userId, caller.userId)))
      .limit(1)

    if (current === undefined) {
      /*
       * Refused with nothing to merge against: this vault has no such note.
       * Deleted and swept, or an id in somebody else's vault — which reads the
       * same from here, deliberately, since saying which would confirm that
       * somebody else's note exists.
       */
      results.push({ status: "missing", id: note.id })
      continue
    }

    results.push({
      status: "conflict",
      id: note.id,
      current: {
        id: current.id,
        ciphertext: current.ciphertext,
        nonce: current.nonce,
        deletedAt: current.deletedAt?.toISOString() ?? null,
        version: current.version
      }
    })
  }

  /*
   * JSON has no bigint and a version is one. Converted case by case rather
   * than through a replacer, which would silently stringify anything it met
   * and quietly follow any shape added here later.
   */
  return Response.json({
    results: results.map((result) => {
      if (result.status === "accepted") return { ...result, version: String(result.version) }
      if (result.status === "missing") return result
      return { ...result, current: { ...result.current, version: String(result.current.version) } }
    })
  })
}

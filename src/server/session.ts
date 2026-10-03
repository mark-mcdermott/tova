/**
 * Who is asking, or nobody.
 *
 * Every route under `/api/vault` goes through this. A handler that reached the
 * database without it would be one `userId` away from serving somebody else's
 * envelope, so the id is never taken from a body or a query — only from a
 * session Better Auth has already verified.
 */

import { getAuth } from "./auth"

export type Caller = { userId: string }

export async function callerOf(request: Request): Promise<Caller | null> {
  const session = await getAuth().api.getSession({ headers: request.headers })
  return session === null ? null : { userId: session.user.id }
}

/** The one refusal, worded the same everywhere so none of them leaks a reason. */
export function unauthorized(): Response {
  return Response.json({ error: "Not signed in" }, { status: 401 })
}

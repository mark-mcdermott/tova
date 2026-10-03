/**
 * Who is asking, or nobody.
 *
 * Every route under `/api/vault` goes through this. A handler that reached the
 * database without it would be one `userId` away from serving somebody else's
 * envelope, so the id is never taken from a body or a query — only from a
 * session Better Auth has already verified.
 */

import { getAuth } from "./auth"

export type Caller = { userId: string; email: string }

export async function callerOf(request: Request): Promise<Caller | null> {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (session === null) return null

  /*
   * The email comes from the verified session too, never from the page.
   *
   * It is the salt a password's wrapping key is derived with, so a wrong one
   * produces a key that opens nothing — which reads to whoever typed the
   * password as the password being wrong.
   */
  return { userId: session.user.id, email: session.user.email }
}

/** The one refusal, worded the same everywhere so none of them leaks a reason. */
export function unauthorized(): Response {
  return Response.json({ error: "Not signed in" }, { status: 401 })
}

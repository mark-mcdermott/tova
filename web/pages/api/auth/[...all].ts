import type { APIRoute } from "astro"
import { getAuth } from "../../../../src/server/auth"

// Not prerendered: it reads a request and a database, neither of which exists
// at build time.
export const prerender = false

/**
 * Every Better Auth route, mounted at `/api/auth/*`.
 *
 * One catch-all rather than a file per ceremony — Better Auth routes
 * internally by path, so sign-up, sign-in, sign-out, password reset and email
 * verification all arrive here.
 *
 * The instance is resolved per request rather than per module, because
 * `BETTER_AUTH_SECRET` and `DATABASE_URL` are runtime-only and Astro evaluates
 * module top-level code at build time as well.
 */
const handle: APIRoute = ({ request }) => getAuth().handler(request)

export const GET = handle
export const POST = handle

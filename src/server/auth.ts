/**
 * Better Auth, which proves who somebody is and nothing more.
 *
 * It never holds anything that decrypts a note. What it is handed in place of a
 * password is `authSecret` from `src/shared/accountKeys.ts` — one half of a
 * split that keeps the other half, the wrapping key, on the device. So this
 * file stores a hash of something that was already a hash, which is the whole
 * reason email and password can be both the way in and the way to unwrap.
 *
 * Built on first use rather than on import, for the reason `getDb` is: Astro
 * evaluates module top-level code at build time too, and `BETTER_AUTH_SECRET`
 * and `DATABASE_URL` are runtime-only. Constructing eagerly would fail every
 * build before anything was actually wrong.
 */

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { getDb } from "./db"
import * as schema from "./db/schema"

let auth: ReturnType<typeof build> | null = null

function build() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret === undefined || secret === "") {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32`, " +
        "and use a different value per environment."
    )
  }

  return betterAuth({
    secret,
    /*
     * Where links in email point, and what redirects are measured against.
     *
     * Without it Better Auth derives the origin from the incoming request,
     * which is fine until a password-reset link is built on a preview deploy
     * and mails somebody a hostname that will not exist next week. Unset in
     * development, where deriving it is exactly right.
     */
    baseURL: process.env.PUBLIC_SITE_URL,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),

    emailAndPassword: {
      enabled: true,
      /*
       * The only way in, deliberately. A magic link or an OAuth provider proves
       * identity and produces nothing to derive a wrapping key from — so the
       * reader would need a second secret, entered on every new device, with no
       * reset and nothing but the recovery key behind it. `docs/SYNC.md`.
       */
      autoSignIn: true,
      /*
       * Eight is Better Auth's own floor and it is not the real guard. What
       * arrives here is already the output of scrypt over the reader's password
       * — so this length is of the derived secret, not of what anyone typed,
       * and the cost of guessing lives in that derivation rather than in a rule
       * about punctuation. The signup form is where a weak password should be
       * argued with.
       */
      minPasswordLength: 8
    },

    session: {
      /*
       * A week, refreshed daily. Signing in is cheap and losing a session only
       * costs a sign-in — the notes are not protected by it, they are protected
       * by a key this server has never seen.
       */
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    },

    advanced: {
      /*
       * Same origin throughout — the app is served from `/app` rather than a
       * subdomain, so there is no cookie domain to set and no preflight to
       * answer. That was the reason to prefer a path over `app.tova.so`.
       */
      useSecureCookies: process.env.NODE_ENV === "production"
    }
  })
}

export function getAuth(): ReturnType<typeof build> {
  if (auth === null) auth = build()
  return auth
}

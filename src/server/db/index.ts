/**
 * The database handle, made on first use rather than on import.
 *
 * Lazily, and the reason is not style. `DATABASE_URL` is a runtime secret, and
 * Astro evaluates module top-level code at build time as well — so a handle
 * constructed where this module is imported would be constructed during every
 * build, with no URL to construct it from, and the build would fail before
 * anything was wrong.
 *
 * One instance per process once it exists. Neon's serverless driver holds no
 * socket of its own, so there is nothing here to pool or close.
 */

import { DATABASE_URL } from "astro:env/server"
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"

type Db = ReturnType<typeof drizzle<typeof schema>>

let db: Db | null = null

export function getDb(): Db {
  if (db !== null) return db

  /*
   * From `astro:env/server`, not `process.env`.
   *
   * Astro reads `.env` into its own env layer and not into `process.env`. On
   * Vercel the two agree, so `process.env.DATABASE_URL` worked in production
   * and was undefined in development against a correct `.env` — the trap
   * `astro.config.mjs` describes, and the second file in this repository to
   * fall into it. `astro.config.mjs` declares the variable; this is the import
   * that declaration exists for.
   */
  const url = DATABASE_URL
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env, or set it in Vercel.")
  }

  db = drizzle(neon(url), { schema })
  return db
}

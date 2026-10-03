import { defineConfig } from "drizzle-kit"

/*
 * `drizzle-kit generate` only reads the schema, so the URL is allowed to be
 * absent there; `push`, `migrate` and `studio` fail on their own with a clear
 * message rather than a confusing one from here.
 */
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  verbose: true,
  strict: true
})

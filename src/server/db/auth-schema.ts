/**
 * Better Auth's own tables.
 *
 * Written out rather than generated, because its CLI wants the auth instance
 * exported eagerly and this one is built on first use — Astro evaluates module
 * top-level code at build time, where `DATABASE_URL` does not exist, so an
 * eager instance fails every build. The lazy construction is the load-bearing
 * part; the schema is the part that can be typed.
 *
 * These are Better Auth's core four, and the shapes are its contract rather
 * than ours — a missing column here fails at sign-in, not at compile.
 *
 * Note the id type: Better Auth mints its own string ids, not UUIDs. Every
 * `user_id` in `schema.ts` is text for that reason, which is not a style
 * choice — a uuid column would reject the ids it issues.
 */

import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull()
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
})

/**
 * Where the password lives — or rather, where the hash of what the client sent
 * lives. What it sent was already `HKDF(scrypt(password, email), "auth")`, so
 * this column is a hash of a hash and the password itself has never been here.
 */
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull()
})

/** Email verification and password-reset tokens, both short-lived. */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date())
})

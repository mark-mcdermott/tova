/**
 * What the server stores, which is deliberately almost nothing.
 *
 * Tova's sync is end to end encrypted: the server cannot read a note. Every
 * column below is either meaningless on its own — a random id — or structural,
 * and the writing itself is one opaque blob. `docs/SYNC.md` is the reasoning,
 * including what that costs.
 *
 * Better Auth owns identity, in `auth-schema.ts`, and is re-exported here so
 * the adapter sees one schema. It proves who someone is; it never holds
 * anything that decrypts what they wrote, and keeping those two separate is the
 * point rather than an accident of layout.
 *
 * Every `user_id` below is `text`, not `uuid`, because Better Auth mints its
 * own string ids — a uuid column would reject every one of them, and the first
 * sign-up would be where anybody found out.
 */

import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { user } from "./auth-schema"

export * from "./auth-schema"

/**
 * One note, as ciphertext.
 *
 * Title, body, tags, section, folder and dates are all inside `ciphertext`.
 * What is left in the clear is what the server needs to hand the right rows
 * back in the right order, and nothing beyond it.
 */
export const notes = pgTable(
  "notes",
  {
    /*
     * The note's own id, minted by the client — the `uid` already written into
     * every note's front matter. Random and meaningless, which is why it can
     * sit in the clear.
     *
     * Not generated here: the client knows a note's identity before the server
     * has ever heard of it, and has to be able to push an edit under that id
     * the first time it is seen.
     */
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** AES-256-GCM over the whole note, front matter and all. */
    ciphertext: text("ciphertext").notNull(),
    /** 12 bytes, fresh for every write. Never reused under one key. */
    nonce: text("nonce").notNull(),

    /*
     * Which content key this row was sealed under.
     *
     * Only ever moves when somebody starts fresh after losing a recovery key.
     * That mints a new content key, and without this column the old rows and
     * the new ones would be indistinguishable — a client would pull notes it
     * cannot decrypt and have no way to know why.
     *
     * The old rows are kept rather than deleted. The whole reason a recovery
     * key exists is that people find things late, and deleting would be the
     * one irreversible step taken on their behalf, on the screen whose entire
     * premise is that nothing can be done for them.
     */
    epoch: integer("epoch").notNull().default(1),

    /*
     * The server's own counter, bumped on every accepted write, and what a
     * client sends back to say which version it edited from.
     *
     * A sequence rather than a timestamp because this orders a pull, and a
     * client's clock cannot be trusted to order anything. `updatedAt` is for
     * showing someone when they last touched a note.
     */
    version: bigint("version", { mode: "bigint" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    /*
     * A tombstone rather than a delete, so the deletion itself can travel. A
     * row removed outright would simply be absent from the next pull, which is
     * indistinguishable from never having existed — and the other device would
     * push it straight back.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => [
    // The pull: everything of mine above a cursor, in order. Both columns, in
    // this order, because the scan is per-reader and the cursor is the range.
    index("notes_user_version_idx").on(table.userId, table.version)
  ]
)

/**
 * The content key, wrapped — once per factor that can unwrap it.
 *
 * The key itself is 32 random bytes and belongs to the reader, not to a
 * password: that is what lets a password change without re-encrypting a single
 * note, and what makes the recovery key a second door of equal standing rather
 * than a lesser one.
 *
 * What the server holds is the sealed envelope. Supplying the right factor
 * unwraps it on the client, and the key never crosses the wire in the clear.
 */
export const keyEnvelopes = pgTable(
  "key_envelopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** Which factor opens this one: a password, or the recovery key. */
    kind: text("kind", { enum: ["password", "recovery"] }).notNull(),

    /*
     * Which content key this envelope holds. Matches `notes.epoch`.
     *
     * Old epochs are kept, so a recovery key found in a drawer next year still
     * opens the notes it was made for. A client takes the highest epoch it can
     * unwrap and reads that; the rest stay sealed and harmless.
     */
    epoch: integer("epoch").notNull().default(1),

    /** Per-envelope, so two factors never derive the same wrapping key. */
    salt: text("salt").notNull(),
    /** The content key, sealed by the key derived from that factor. */
    envelope: text("envelope").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    // One of each kind per epoch. Two password envelopes for one epoch would
    // mean two keys, and half that epoch's notes would stop opening — while
    // across epochs they are meant to differ.
    uniqueIndex("key_envelopes_user_kind_epoch_idx").on(table.userId, table.kind, table.epoch)
  ]
)

/**
 * Where someone is signed in, so they can see it and end it.
 *
 * Carries no key material. Revoking a device is an auth question — it stops
 * that session fetching envelopes — and is not, and cannot be, a way to reach
 * back and lock a key that device already unwrapped.
 */
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** What the reader sees in a list. Theirs to set, and never trusted. */
    name: text("name").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("devices_user_idx").on(table.userId)]
)

export type NoteRow = typeof notes.$inferSelect
export type NewNoteRow = typeof notes.$inferInsert
export type KeyEnvelopeRow = typeof keyEnvelopes.$inferSelect
export type DeviceRow = typeof devices.$inferSelect

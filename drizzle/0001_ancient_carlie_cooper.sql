DROP INDEX "key_envelopes_user_kind_idx";--> statement-breakpoint
ALTER TABLE "key_envelopes" ADD COLUMN "epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "key_envelopes_user_kind_epoch_idx" ON "key_envelopes" USING btree ("user_id","kind","epoch");
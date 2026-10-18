ALTER TABLE "todos" ADD COLUMN "ownerId" text NOT NULL;--> statement-breakpoint
CREATE INDEX "todos_owner_id_idx" ON "todos" USING btree ("ownerId","id");
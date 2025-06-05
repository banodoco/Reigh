ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'Pending';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "generation_processed_at" timestamp with time zone;
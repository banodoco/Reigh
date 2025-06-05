ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'Queued';--> statement-breakpoint
DROP TYPE "public"."task_status";
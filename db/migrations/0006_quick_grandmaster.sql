CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "generation_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_workers_status" ON "workers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workers_last_heartbeat" ON "workers" USING btree ("last_heartbeat");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tasks_worker_id" ON "tasks" USING btree ("worker_id");
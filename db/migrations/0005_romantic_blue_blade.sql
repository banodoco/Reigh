CREATE TABLE "task_cost_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"category" text NOT NULL,
	"display_name" text NOT NULL,
	"base_cost_cents_per_second" integer NOT NULL,
	"cost_factors" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_cost_configs_task_type_unique" UNIQUE("task_type")
);
--> statement-breakpoint
DROP TABLE "task_costs" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "generation_started_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_task_cost_configs_task_type" ON "task_cost_configs" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "idx_task_cost_configs_category" ON "task_cost_configs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_task_cost_configs_active" ON "task_cost_configs" USING btree ("is_active");
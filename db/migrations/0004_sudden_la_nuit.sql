CREATE TABLE "task_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"base_cost_cents" integer NOT NULL,
	"total_cost_cents" integer NOT NULL,
	"cost_factors" jsonb,
	"cost_per_second" integer,
	"estimated_duration_seconds" integer,
	"actual_duration_seconds" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"billing_status" text DEFAULT 'pending' NOT NULL,
	"charged_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task_costs" ADD CONSTRAINT "task_costs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_costs" ADD CONSTRAINT "task_costs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_costs_task_id" ON "task_costs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_costs_user_id" ON "task_costs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_task_costs_task_type" ON "task_costs" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "idx_task_costs_billing_status" ON "task_costs" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX "idx_task_costs_started_at" ON "task_costs" USING btree ("started_at");
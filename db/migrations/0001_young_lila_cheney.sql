CREATE TYPE "public"."credit_ledger_type" AS ENUM('stripe', 'manual', 'spend', 'refund');--> statement-breakpoint
CREATE TABLE "credits_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"amount" integer NOT NULL,
	"type" "credit_ledger_type" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credits_ledger" ADD CONSTRAINT "credits_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_credits_ledger_user_id" ON "credits_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_credits_ledger_type" ON "credits_ledger" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_credits_ledger_created_at" ON "credits_ledger" USING btree ("created_at");
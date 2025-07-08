CREATE TABLE "training_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"storage_location" text NOT NULL,
	"duration" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_data_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_data_id" uuid NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"segment_location" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "training_data" ADD CONSTRAINT "training_data_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_data_segments" ADD CONSTRAINT "training_data_segments_training_data_id_training_data_id_fk" FOREIGN KEY ("training_data_id") REFERENCES "public"."training_data"("id") ON DELETE cascade ON UPDATE no action;
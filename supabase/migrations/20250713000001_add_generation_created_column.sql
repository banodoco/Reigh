-- Add generation_created column to tasks table
ALTER TABLE "tasks" ADD COLUMN "generation_created" boolean DEFAULT false NOT NULL;
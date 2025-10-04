-- Add name column to generations table for variant naming
-- This allows users to label different generation variants (e.g., "high-contrast", "bright-colors")

ALTER TABLE "public"."generations" 
ADD COLUMN "name" text;

COMMENT ON COLUMN "public"."generations"."name" IS 'Optional variant name for the generation (e.g., "high-contrast", "style-test-1")';

-- Create an index for faster filtering/searching by name
CREATE INDEX IF NOT EXISTS "idx_generations_name" ON "public"."generations" ("name") WHERE "name" IS NOT NULL;


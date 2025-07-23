-- Add starred field to generations table
ALTER TABLE "generations" ADD COLUMN "starred" boolean DEFAULT false NOT NULL;

-- Create index for better query performance when filtering by starred
CREATE INDEX "idx_generations_starred" ON "generations" USING btree ("starred");
CREATE INDEX "idx_generations_project_starred" ON "generations" USING btree ("project_id", "starred"); 
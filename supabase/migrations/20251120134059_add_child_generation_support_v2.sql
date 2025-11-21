ALTER TABLE "generations" ADD COLUMN "parent_generation_id" uuid REFERENCES "generations"("id") ON DELETE CASCADE;
ALTER TABLE "generations" ADD COLUMN "child_order" integer;
ALTER TABLE "generations" ADD COLUMN "is_child" boolean DEFAULT false NOT NULL;
ALTER TABLE "generations" ADD COLUMN "children" jsonb;



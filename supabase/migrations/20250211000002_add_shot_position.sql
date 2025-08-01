-- Add position field to shots table for manual ordering
ALTER TABLE "public"."shots" ADD COLUMN "position" integer;

-- Set initial position values based on created_at order (newest gets highest position)
-- This ensures existing shots maintain their current order when position ordering is applied
UPDATE "public"."shots" 
SET "position" = sub.row_num 
FROM (
  SELECT 
    id, 
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) as row_num
  FROM "public"."shots"
) sub 
WHERE "public"."shots".id = sub.id;

-- Add not null constraint after populating values
ALTER TABLE "public"."shots" ALTER COLUMN "position" SET NOT NULL;

-- Add default value for new shots (will be the highest position + 1 in the project)
ALTER TABLE "public"."shots" ALTER COLUMN "position" SET DEFAULT 1;

-- Create function to auto-assign position to new shots
CREATE OR REPLACE FUNCTION set_new_shot_position()
RETURNS TRIGGER AS $$
BEGIN
  -- If position is not provided, set it to max + 1 for the project
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
    FROM shots 
    WHERE project_id = NEW.project_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-assign position to new shots
CREATE TRIGGER trigger_set_shot_position
  BEFORE INSERT ON shots
  FOR EACH ROW
  EXECUTE FUNCTION set_new_shot_position(); 
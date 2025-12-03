-- Add project_id column to generation_variants and auto-populate from parent generation
-- This makes querying variants by project much more efficient

-- 1. Add the project_id column
ALTER TABLE generation_variants 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 2. Create index for efficient project-based queries
CREATE INDEX IF NOT EXISTS idx_generation_variants_project_id 
ON generation_variants(project_id) 
WHERE project_id IS NOT NULL;

-- 3. Create trigger function to auto-populate project_id from parent generation
CREATE OR REPLACE FUNCTION set_variant_project_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Look up the project_id from the parent generation
  SELECT project_id INTO NEW.project_id
  FROM generations
  WHERE id = NEW.generation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to run before insert
DROP TRIGGER IF EXISTS trigger_set_variant_project_id ON generation_variants;
CREATE TRIGGER trigger_set_variant_project_id
  BEFORE INSERT ON generation_variants
  FOR EACH ROW
  EXECUTE FUNCTION set_variant_project_id();

-- 5. Backfill existing variants with project_id from their parent generation
UPDATE generation_variants gv
SET project_id = g.project_id
FROM generations g
WHERE gv.generation_id = g.id
AND gv.project_id IS NULL;

-- 6. Log completion
SELECT 'Added project_id column to generation_variants with auto-populate trigger' as status;


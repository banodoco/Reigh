-- Temporarily disable the check constraint, migrate position to timeline_frame, then re-enable
-- This handles any constraint issues during migration

-- First, check if there's a timeline_frame_non_negative constraint
DO $$
DECLARE
  constraint_exists boolean := false;
BEGIN
  SELECT EXISTS(
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE table_name = 'shot_generations' 
      AND constraint_name = 'timeline_frame_non_negative'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    -- Temporarily drop the constraint
    ALTER TABLE shot_generations DROP CONSTRAINT timeline_frame_non_negative;
    RAISE LOG 'Dropped timeline_frame_non_negative constraint for migration';
  END IF;
END $$;

-- Now perform the migration
UPDATE shot_generations 
SET timeline_frame = CASE 
  WHEN position IS NULL THEN NULL
  ELSE GREATEST(0, position * 60)  -- Ensure no negative values, position 0 becomes frame 0
END,
metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'migrated_from_position', true,
  'original_position', position,
  'migration_timestamp', NOW()::text
);

-- Log the migration results
DO $$
DECLARE
  updated_count integer;
  null_position_count integer;
  zero_position_count integer;
  negative_timeline_frames integer;
BEGIN
  -- Count updated records
  SELECT COUNT(*) INTO updated_count 
  FROM shot_generations 
  WHERE timeline_frame IS NOT NULL;
  
  -- Count records with null position
  SELECT COUNT(*) INTO null_position_count 
  FROM shot_generations 
  WHERE position IS NULL;
  
  -- Count records with position 0
  SELECT COUNT(*) INTO zero_position_count 
  FROM shot_generations 
  WHERE position = 0;
  
  -- Count records with negative timeline_frames
  SELECT COUNT(*) INTO negative_timeline_frames 
  FROM shot_generations 
  WHERE timeline_frame < 0;
  
  RAISE LOG 'Migration completed: % records updated with timeline_frame, % records with null position, % records had position=0, % have negative timeline_frames', 
    updated_count, null_position_count, zero_position_count, negative_timeline_frames;
END $$;

-- Re-add the constraint
ALTER TABLE shot_generations ADD CONSTRAINT timeline_frame_non_negative CHECK (timeline_frame >= 0);

-- Verify the migration
SELECT 'Migrated all shot_generations from position to timeline_frame (with constraint handling)' as status;

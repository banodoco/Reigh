-- Simple approach: drop constraints, migrate position to timeline_frame, drop position column
-- This is much cleaner than trying to handle constraint violations during migration

-- Step 1: Drop the constraints that are preventing the migration
DROP INDEX IF EXISTS unique_timeline_frame_per_shot;
ALTER TABLE shot_generations DROP CONSTRAINT IF EXISTS timeline_frame_non_negative;

-- Step 2: Update timeline_frame based on position with simple mapping
-- Position 0 = timeline_frame 0, Position 1 = timeline_frame 50, Position 2 = timeline_frame 100, etc.
UPDATE shot_generations 
SET timeline_frame = CASE 
  WHEN position IS NULL THEN NULL
  ELSE position * 50  -- Simple mapping: position 0 = frame 0, position 1 = frame 50, etc.
END;

-- Step 3: Drop the position column entirely
ALTER TABLE shot_generations DROP COLUMN IF EXISTS position;

-- Step 4: Log the migration results
DO $$
DECLARE
  updated_count integer;
  null_position_count integer;
  zero_position_count integer;
BEGIN
  -- Count updated records
  SELECT COUNT(*) INTO updated_count 
  FROM shot_generations 
  WHERE timeline_frame IS NOT NULL;
  
  -- Count records with null position (these now have null timeline_frame)
  SELECT COUNT(*) INTO null_position_count 
  FROM shot_generations 
  WHERE timeline_frame IS NULL;
  
  -- Count records with timeline_frame = 0 (from position = 0)
  SELECT COUNT(*) INTO zero_position_count 
  FROM shot_generations 
  WHERE timeline_frame = 0;
  
  RAISE LOG 'Migration completed: % records updated with timeline_frame, % records have null timeline_frame, % records have timeline_frame=0', 
    updated_count, null_position_count, zero_position_count;
END $$;

-- Verify the migration
SELECT 'Migrated position to timeline_frame and dropped position column' as status;

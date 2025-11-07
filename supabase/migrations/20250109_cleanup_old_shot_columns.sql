-- ============================================================================
-- Migration: Cleanup old shot_id/timeline_frame columns
-- ============================================================================
-- The V2 migration added shot_data successfully but may not have dropped
-- the old columns due to duplicate key error. This ensures cleanup.
-- ============================================================================

-- Drop old columns if they still exist
DO $$ 
BEGIN
  -- Drop shot_id if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_id'
  ) THEN
    RAISE NOTICE 'Dropping old shot_id column...';
    ALTER TABLE generations DROP COLUMN shot_id;
    RAISE NOTICE '✅ Dropped shot_id column';
  ELSE
    RAISE NOTICE '✅ shot_id column already dropped';
  END IF;

  -- Drop timeline_frame if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'timeline_frame'
  ) THEN
    RAISE NOTICE 'Dropping old timeline_frame column...';
    ALTER TABLE generations DROP COLUMN timeline_frame;
    RAISE NOTICE '✅ Dropped timeline_frame column';
  ELSE
    RAISE NOTICE '✅ timeline_frame column already dropped';
  END IF;

  -- Verify shot_data exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_data'
  ) THEN
    RAISE NOTICE '✅ shot_data column exists';
  ELSE
    RAISE NOTICE '❌ WARNING: shot_data column does not exist!';
  END IF;
END $$;

-- Cleanup complete


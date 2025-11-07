-- ============================================================================
-- MANUAL CLEANUP SCRIPT - Run this in Supabase SQL Editor
-- ============================================================================
-- This manually completes the migration that keeps erroring due to duplicate key
-- ============================================================================

-- Step 1: Mark the V2 migration as completed (if not already)
-- This allows future migrations to run
DO $$
BEGIN
  INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
  VALUES (
    '20250107',
    ARRAY['-- V2 migration statements'],
    '20250107_add_shot_denormalization_v2'
  )
  ON CONFLICT (version) DO NOTHING;

  RAISE NOTICE '✅ Migration marked as completed';
END $$;

-- Step 2: Add shot_data column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_data'
  ) THEN
    RAISE NOTICE '➕ Adding shot_data JSONB column...';
    ALTER TABLE generations ADD COLUMN shot_data JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '✅ Added shot_data column';
  ELSE
    RAISE NOTICE '✅ shot_data column already exists';
  END IF;
END $$;

-- Step 3: Create indexes for shot_data
DO $$
BEGIN
  DROP INDEX IF EXISTS idx_generations_shot_data_gin;
  CREATE INDEX idx_generations_shot_data_gin ON generations USING GIN(shot_data);
  RAISE NOTICE '✅ Created GIN index on shot_data';

  DROP INDEX IF EXISTS idx_generations_has_shots;
  CREATE INDEX idx_generations_has_shots ON generations((shot_data != '{}'::jsonb))
  WHERE shot_data != '{}'::jsonb;
  RAISE NOTICE '✅ Created has_shots index';
END $$;

-- Step 4: Backfill shot_data from shot_generations (if empty)
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Check if shot_data needs backfilling
  WITH needs_backfill AS (
    SELECT COUNT(*) as cnt
    FROM generations
    WHERE shot_data = '{}'::jsonb
    AND id IN (SELECT generation_id FROM shot_generations)
  )
  SELECT cnt INTO v_updated_count FROM needs_backfill;
  
  IF v_updated_count > 0 THEN
    RAISE NOTICE '📦 Backfilling % generations...', v_updated_count;
    
    WITH shot_aggregates AS (
      SELECT 
        generation_id,
        jsonb_object_agg(shot_id::text, timeline_frame) as shot_data
      FROM shot_generations
      GROUP BY generation_id
    )
    UPDATE generations g
    SET shot_data = sa.shot_data
    FROM shot_aggregates sa
    WHERE g.id = sa.generation_id
      AND g.shot_data = '{}'::jsonb;
    
    RAISE NOTICE '✅ Backfilled shot_data';
  ELSE
    RAISE NOTICE '✅ shot_data already backfilled';
  END IF;
END $$;

-- Step 5: Check what columns currently exist
DO $$
DECLARE
  has_shot_id BOOLEAN;
  has_timeline_frame BOOLEAN;
  has_shot_data BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_id'
  ) INTO has_shot_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'timeline_frame'
  ) INTO has_timeline_frame;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_data'
  ) INTO has_shot_data;

  RAISE NOTICE '📊 Current column status:';
  RAISE NOTICE '  - shot_id exists: %', has_shot_id;
  RAISE NOTICE '  - timeline_frame exists: %', has_timeline_frame;
  RAISE NOTICE '  - shot_data exists: %', has_shot_data;
END $$;

-- Step 6: Drop old columns if they exist
DO $$ 
BEGIN
  -- Drop shot_id if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_id'
  ) THEN
    RAISE NOTICE '🗑️ Dropping old shot_id column...';
    ALTER TABLE generations DROP COLUMN shot_id CASCADE;
    RAISE NOTICE '✅ Dropped shot_id column';
  ELSE
    RAISE NOTICE '✅ shot_id column already dropped';
  END IF;

  -- Drop timeline_frame if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'timeline_frame'
  ) THEN
    RAISE NOTICE '🗑️ Dropping old timeline_frame column...';
    ALTER TABLE generations DROP COLUMN timeline_frame CASCADE;
    RAISE NOTICE '✅ Dropped timeline_frame column';
  ELSE
    RAISE NOTICE '✅ timeline_frame column already dropped';
  END IF;

  -- Verify shot_data exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'generations' AND column_name = 'shot_data'
  ) THEN
    RAISE NOTICE '✅ shot_data column exists and ready to use';
  ELSE
    RAISE NOTICE '❌ ERROR: shot_data column does not exist! V2 migration may not have fully run.';
  END IF;
END $$;

-- Step 7: Create or replace trigger function and trigger
CREATE OR REPLACE FUNCTION sync_shot_to_generation_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Add/update shot_id and timeline_frame in shot_data JSONB
    UPDATE generations
    SET shot_data = jsonb_set(
      COALESCE(shot_data, '{}'::jsonb),
      ARRAY[NEW.shot_id::TEXT],
      to_jsonb(NEW.timeline_frame),
      true
    )
    WHERE id = NEW.generation_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Remove shot_id from shot_data JSONB
    UPDATE generations
    SET shot_data = shot_data - OLD.shot_id::TEXT
    WHERE id = OLD.generation_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (replacing if it exists)
DROP TRIGGER IF EXISTS sync_shot_generations_jsonb ON shot_generations;
CREATE TRIGGER sync_shot_generations_jsonb
AFTER INSERT OR UPDATE OR DELETE ON shot_generations
FOR EACH ROW
EXECUTE FUNCTION sync_shot_to_generation_jsonb();

-- Step 8: Verify the trigger is working
DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE trigger_name = 'sync_shot_generations_jsonb';
  
  IF trigger_count > 0 THEN
    RAISE NOTICE '✅ Trigger sync_shot_generations_jsonb is active';
  ELSE
    RAISE NOTICE '❌ WARNING: Trigger sync_shot_generations_jsonb not found!';
  END IF;
END $$;

-- Step 9: Sample check - show a few generations with shot_data
DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE '✅ CLEANUP COMPLETE!';
  RAISE NOTICE 'Running sample query...';
END $$;

SELECT 
  id,
  shot_data,
  created_at
FROM generations
WHERE shot_data IS NOT NULL 
  AND shot_data != '{}'::jsonb
LIMIT 3;

-- All done! Check the results above and refresh your app.


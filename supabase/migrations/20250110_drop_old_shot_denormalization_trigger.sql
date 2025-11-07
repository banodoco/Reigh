-- ============================================================================
-- Drop old denormalization trigger and function
-- ============================================================================
-- The old sync_shot_to_generation trigger from the first denormalization
-- attempt tries to UPDATE generations.shot_id (which no longer exists).
-- This causes "column shot_id does not exist" errors on shot duplication.
-- 
-- We now use sync_shot_to_generation_jsonb which updates shot_data instead.
-- ============================================================================

-- Drop the old trigger
DROP TRIGGER IF EXISTS sync_shot_generations ON shot_generations;

-- Drop the old function
DROP FUNCTION IF EXISTS sync_shot_to_generation();

-- Verify the new JSONB trigger exists
DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE trigger_name = 'sync_shot_generations_jsonb'
    AND event_object_table = 'shot_generations';
  
  IF trigger_count = 0 THEN
    RAISE WARNING '⚠️ sync_shot_generations_jsonb trigger not found! Run manual_cleanup.sql first.';
  ELSE
    RAISE NOTICE '✅ sync_shot_generations_jsonb trigger is active';
  END IF;
END $$;


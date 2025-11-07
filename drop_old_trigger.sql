-- ============================================================================
-- QUICK FIX: Drop old shot denormalization trigger
-- ============================================================================
-- Run this in Supabase SQL Editor to fix "column shot_id does not exist" error
-- ============================================================================

-- Drop the old trigger that writes to non-existent shot_id column
DROP TRIGGER IF EXISTS sync_shot_generations ON shot_generations;

-- Drop the old function
DROP FUNCTION IF EXISTS sync_shot_to_generation();

-- Verify only the new JSONB trigger exists
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'shot_generations'
  AND trigger_name LIKE '%sync%';

-- Expected result: Only sync_shot_generations_jsonb should be listed
-- If you see sync_shot_generations, the old trigger is still there (run this script again)

SELECT '✅ Old trigger dropped! Shot duplication should work now.' AS status;


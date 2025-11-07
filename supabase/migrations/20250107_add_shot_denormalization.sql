-- ============================================================================
-- Migration: Denormalize shot_generations into generations table
-- ============================================================================
-- This migration adds shot_id and timeline_frame columns to the generations
-- table and creates robust triggers to keep them in sync with shot_generations.
--
-- WHY: Shot filtering was extremely slow (2-3s) because it required:
--   1. Fetching all generation IDs from shot_generations (paginated)
--   2. Chunking IDs to avoid Postgres IN clause limits
--   3. Multiple round-trips to fetch data
--
-- SOLUTION: Denormalize shot data directly into generations for fast queries
-- ============================================================================

-- Step 1: Add columns to generations table
-- ============================================================================
ALTER TABLE generations 
ADD COLUMN IF NOT EXISTS shot_id UUID REFERENCES shots(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS timeline_frame INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN generations.shot_id IS 'Denormalized from shot_generations for query performance. Auto-synced via trigger.';
COMMENT ON COLUMN generations.timeline_frame IS 'Denormalized from shot_generations for query performance. Auto-synced via trigger.';

-- Step 2: Create indexes for fast filtering
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_generations_shot_id 
ON generations(shot_id) 
WHERE shot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generations_shot_timeline 
ON generations(shot_id, timeline_frame) 
WHERE shot_id IS NOT NULL;

-- Composite index for common query pattern (shot + positioned filter + order by date)
CREATE INDEX IF NOT EXISTS idx_generations_shot_filter 
ON generations(shot_id, timeline_frame, created_at DESC) 
WHERE shot_id IS NOT NULL;

-- Step 3: Create robust sync function
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_shot_to_generation()
RETURNS TRIGGER AS $$
DECLARE
  v_generation_id UUID;
  v_shot_id UUID;
  v_timeline_frame INTEGER;
BEGIN
  -- Handle INSERT: New shot_generation created
  IF TG_OP = 'INSERT' THEN
    RAISE NOTICE '[TRIGGER] INSERT shot_generation: gen_id=%, shot_id=%, frame=%', 
      NEW.generation_id, NEW.shot_id, NEW.timeline_frame;
    
    -- Update the generation with shot info
    UPDATE generations 
    SET shot_id = NEW.shot_id,
        timeline_frame = NEW.timeline_frame
    WHERE id = NEW.generation_id;
    
    -- Verify the update worked
    IF NOT FOUND THEN
      RAISE WARNING '[TRIGGER] Generation % not found for INSERT', NEW.generation_id;
    END IF;
    
    RETURN NEW;
  
  -- Handle UPDATE: Shot assignment changed or frame moved
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE NOTICE '[TRIGGER] UPDATE shot_generation: gen_id=%, old_shot=%, new_shot=%, old_frame=%, new_frame=%', 
      NEW.generation_id, OLD.shot_id, NEW.shot_id, OLD.timeline_frame, NEW.timeline_frame;
    
    -- Update the generation with new shot info
    UPDATE generations 
    SET shot_id = NEW.shot_id,
        timeline_frame = NEW.timeline_frame
    WHERE id = NEW.generation_id;
    
    -- Verify the update worked
    IF NOT FOUND THEN
      RAISE WARNING '[TRIGGER] Generation % not found for UPDATE', NEW.generation_id;
    END IF;
    
    RETURN NEW;
  
  -- Handle DELETE: Shot_generation removed
  ELSIF TG_OP = 'DELETE' THEN
    RAISE NOTICE '[TRIGGER] DELETE shot_generation: gen_id=%, shot_id=%', 
      OLD.generation_id, OLD.shot_id;
    
    -- Check if there are OTHER shot_generations for this generation
    -- (shouldn't happen, but handle gracefully)
    SELECT sg.shot_id, sg.timeline_frame
    INTO v_shot_id, v_timeline_frame
    FROM shot_generations sg
    WHERE sg.generation_id = OLD.generation_id
      AND sg.shot_id != OLD.shot_id  -- Different shot
    LIMIT 1;
    
    IF FOUND THEN
      -- Another shot_generation exists, use that one
      RAISE WARNING '[TRIGGER] Multiple shot_generations found for generation %. Using shot_id=%', 
        OLD.generation_id, v_shot_id;
      
      UPDATE generations 
      SET shot_id = v_shot_id,
          timeline_frame = v_timeline_frame
      WHERE id = OLD.generation_id;
    ELSE
      -- No other shot_generations, clear the fields
      UPDATE generations 
      SET shot_id = NULL,
          timeline_frame = NULL
      WHERE id = OLD.generation_id;
    END IF;
    
    -- Verify the update worked
    IF NOT FOUND THEN
      RAISE WARNING '[TRIGGER] Generation % not found for DELETE', OLD.generation_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_shot_to_generation IS 
'Keeps generations.shot_id and generations.timeline_frame in sync with shot_generations table. 
Handles INSERT, UPDATE, DELETE robustly with logging and edge case handling.';

-- Step 4: Create trigger on shot_generations
-- ============================================================================
DROP TRIGGER IF EXISTS sync_shot_generations ON shot_generations;

CREATE TRIGGER sync_shot_generations
AFTER INSERT OR UPDATE OR DELETE ON shot_generations
FOR EACH ROW
EXECUTE FUNCTION sync_shot_to_generation();

COMMENT ON TRIGGER sync_shot_generations ON shot_generations IS
'Auto-syncs shot data to generations table for query performance. 
Fires on INSERT, UPDATE, DELETE of shot_generations rows.';

-- Step 5: Backfill existing data
-- ============================================================================
-- This will populate shot_id and timeline_frame for all existing generations
-- that have entries in shot_generations

DO $$
DECLARE
  v_updated_count INTEGER;
  v_total_count INTEGER;
BEGIN
  RAISE NOTICE '[BACKFILL] Starting backfill of shot data to generations table...';
  
  -- Get total count of shot_generations
  SELECT COUNT(*) INTO v_total_count FROM shot_generations;
  RAISE NOTICE '[BACKFILL] Found % shot_generation records to backfill', v_total_count;
  
  -- Update generations with shot data from shot_generations
  WITH shot_data AS (
    SELECT DISTINCT ON (generation_id)
      generation_id,
      shot_id,
      timeline_frame
    FROM shot_generations
    ORDER BY generation_id, created_at DESC  -- Use most recent if multiple exist
  )
  UPDATE generations g
  SET shot_id = sd.shot_id,
      timeline_frame = sd.timeline_frame
  FROM shot_data sd
  WHERE g.id = sd.generation_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RAISE NOTICE '[BACKFILL] Successfully updated % generations with shot data', v_updated_count;
  
  -- Verify backfill
  IF v_updated_count != v_total_count THEN
    RAISE WARNING '[BACKFILL] Mismatch: % shot_generations but only % generations updated. Some generations may not exist.',
      v_total_count, v_updated_count;
  ELSE
    RAISE NOTICE '[BACKFILL] ✅ Backfill complete! All shot data synced successfully.';
  END IF;
END $$;

-- Step 6: Add validation constraint (optional but recommended)
-- ============================================================================
-- Ensures that if shot_id is set, the generation actually exists in shot_generations
-- This is a safety check, but we make it NOT VALID initially to avoid blocking the migration

-- Note: Commented out for now as it might be too restrictive if you ever want to 
-- manually set shot_id without going through shot_generations
-- Uncomment if you want strict enforcement

/*
ALTER TABLE generations
ADD CONSTRAINT fk_generations_shot_id_exists
FOREIGN KEY (shot_id) 
REFERENCES shots(id) 
ON DELETE SET NULL
NOT VALID;

-- Validate the constraint in the background (won't block writes)
-- Run this separately after migration completes:
-- ALTER TABLE generations VALIDATE CONSTRAINT fk_generations_shot_id_exists;
*/

-- Step 7: Create helper function to verify sync (for debugging)
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_shot_sync()
RETURNS TABLE (
  generation_id UUID,
  gen_shot_id UUID,
  sg_shot_id UUID,
  gen_frame INTEGER,
  sg_frame INTEGER,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    g.id as generation_id,
    g.shot_id as gen_shot_id,
    sg.shot_id as sg_shot_id,
    g.timeline_frame as gen_frame,
    sg.timeline_frame as sg_frame,
    CASE 
      WHEN g.shot_id IS NULL AND sg.shot_id IS NULL THEN 'OK: Both NULL'
      WHEN g.shot_id = sg.shot_id AND g.timeline_frame = sg.timeline_frame THEN 'OK: In Sync'
      WHEN g.shot_id = sg.shot_id AND g.timeline_frame IS DISTINCT FROM sg.timeline_frame THEN 'MISMATCH: Frame differs'
      WHEN g.shot_id IS DISTINCT FROM sg.shot_id THEN 'MISMATCH: Shot differs'
      ELSE 'UNKNOWN'
    END as status
  FROM generations g
  FULL OUTER JOIN shot_generations sg ON g.id = sg.generation_id
  WHERE g.shot_id IS DISTINCT FROM sg.shot_id 
     OR g.timeline_frame IS DISTINCT FROM sg.timeline_frame;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_shot_sync IS
'Debugging function to find any generations where shot_id/timeline_frame is out of sync with shot_generations.
Should return 0 rows if everything is working correctly.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
RAISE NOTICE '✅ Migration complete! Shot denormalization is now active.';
RAISE NOTICE '   - Added shot_id and timeline_frame columns to generations';
RAISE NOTICE '   - Created indexes for fast shot filtering';  
RAISE NOTICE '   - Created robust sync trigger on shot_generations';
RAISE NOTICE '   - Backfilled existing data';
RAISE NOTICE '';
RAISE NOTICE '📊 To verify sync, run: SELECT * FROM verify_shot_sync();';
RAISE NOTICE '   (Should return 0 rows if everything is in sync)';


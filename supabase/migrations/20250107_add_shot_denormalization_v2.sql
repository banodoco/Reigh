-- ============================================================================
-- Migration: Denormalize shot_generations into generations table (V2 - JSONB)
-- ============================================================================
-- This migration replaces the previous shot_id/timeline_frame columns with
-- a JSONB column that can handle multiple shots per generation.
--
-- WHY V2: Generations can be in MULTIPLE shots, each with different frames.
-- SOLUTION: Store as JSONB: {"shot_uuid": frame_number, ...}
-- ============================================================================

-- Step 1: Drop old columns and indexes if they exist
-- ============================================================================
DROP INDEX IF EXISTS idx_generations_shot_id;
DROP INDEX IF EXISTS idx_generations_shot_timeline;
DROP INDEX IF EXISTS idx_generations_shot_filter;

ALTER TABLE generations 
DROP COLUMN IF EXISTS shot_id,
DROP COLUMN IF EXISTS timeline_frame;

-- Step 2: Add JSONB column for shot data
-- ============================================================================
ALTER TABLE generations 
ADD COLUMN IF NOT EXISTS shot_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN generations.shot_data IS 
'Denormalized shot data from shot_generations. 
Format: {"shot_uuid": frame_number, ...} where frame_number is INTEGER or null.
Auto-synced via trigger.';

-- Step 3: Create GIN index for fast shot lookups
-- ============================================================================
-- GIN index allows fast queries like: WHERE shot_data ? 'shot-uuid'
CREATE INDEX IF NOT EXISTS idx_generations_shot_data_gin 
ON generations USING GIN(shot_data);

-- Additional index for shot data existence (faster for "has any shots" queries)
CREATE INDEX IF NOT EXISTS idx_generations_has_shots
ON generations((shot_data != '{}'::jsonb))
WHERE shot_data != '{}'::jsonb;

-- Step 4: Create robust sync function for JSONB
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_shot_to_generation_jsonb()
RETURNS TRIGGER AS $$
DECLARE
  v_current_data JSONB;
  v_new_data JSONB;
BEGIN
  -- Handle INSERT: Add shot to JSONB
  IF TG_OP = 'INSERT' THEN
    RAISE NOTICE '[TRIGGER] INSERT shot_generation: gen_id=%, shot_id=%, frame=%', 
      NEW.generation_id, NEW.shot_id, NEW.timeline_frame;
    
    -- Get current shot_data
    SELECT shot_data INTO v_current_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[TRIGGER] Generation % not found for INSERT', NEW.generation_id;
      RETURN NEW;
    END IF;
    
    -- Add new shot to JSONB (or update if already exists)
    v_new_data := COALESCE(v_current_data, '{}'::jsonb) || 
                  jsonb_build_object(NEW.shot_id::text, NEW.timeline_frame);
    
    -- Update generation
    UPDATE generations 
    SET shot_data = v_new_data
    WHERE id = NEW.generation_id;
    
    RAISE NOTICE '[TRIGGER] Added shot % (frame %) to generation %', 
      NEW.shot_id, NEW.timeline_frame, NEW.generation_id;
    
    RETURN NEW;
  
  -- Handle UPDATE: Update shot frame in JSONB
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE NOTICE '[TRIGGER] UPDATE shot_generation: gen_id=%, old_shot=%, new_shot=%, old_frame=%, new_frame=%', 
      NEW.generation_id, OLD.shot_id, NEW.shot_id, OLD.timeline_frame, NEW.timeline_frame;
    
    -- Get current shot_data
    SELECT shot_data INTO v_current_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[TRIGGER] Generation % not found for UPDATE', NEW.generation_id;
      RETURN NEW;
    END IF;
    
    v_new_data := COALESCE(v_current_data, '{}'::jsonb);
    
    -- If shot_id changed, remove old and add new
    IF OLD.shot_id != NEW.shot_id THEN
      v_new_data := v_new_data - OLD.shot_id::text;
      v_new_data := v_new_data || jsonb_build_object(NEW.shot_id::text, NEW.timeline_frame);
    ELSE
      -- Just update the frame for the same shot
      v_new_data := v_new_data || jsonb_build_object(NEW.shot_id::text, NEW.timeline_frame);
    END IF;
    
    -- Update generation
    UPDATE generations 
    SET shot_data = v_new_data
    WHERE id = NEW.generation_id;
    
    RAISE NOTICE '[TRIGGER] Updated shot data for generation %', NEW.generation_id;
    
    RETURN NEW;
  
  -- Handle DELETE: Remove shot from JSONB
  ELSIF TG_OP = 'DELETE' THEN
    RAISE NOTICE '[TRIGGER] DELETE shot_generation: gen_id=%, shot_id=%', 
      OLD.generation_id, OLD.shot_id;
    
    -- Get current shot_data
    SELECT shot_data INTO v_current_data
    FROM generations
    WHERE id = OLD.generation_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[TRIGGER] Generation % not found for DELETE', OLD.generation_id;
      RETURN OLD;
    END IF;
    
    -- Remove shot from JSONB
    v_new_data := COALESCE(v_current_data, '{}'::jsonb) - OLD.shot_id::text;
    
    -- Update generation
    UPDATE generations 
    SET shot_data = v_new_data
    WHERE id = OLD.generation_id;
    
    RAISE NOTICE '[TRIGGER] Removed shot % from generation %', 
      OLD.shot_id, OLD.generation_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_shot_to_generation_jsonb IS 
'Keeps generations.shot_data JSONB in sync with shot_generations table. 
Handles INSERT, UPDATE, DELETE robustly with logging.
Format: {"shot_uuid": frame_number, ...}';

-- Step 5: Replace trigger on shot_generations
-- ============================================================================
DROP TRIGGER IF EXISTS sync_shot_generations ON shot_generations;

CREATE TRIGGER sync_shot_generations
AFTER INSERT OR UPDATE OR DELETE ON shot_generations
FOR EACH ROW
EXECUTE FUNCTION sync_shot_to_generation_jsonb();

COMMENT ON TRIGGER sync_shot_generations ON shot_generations IS
'Auto-syncs shot data to generations.shot_data JSONB for query performance. 
Fires on INSERT, UPDATE, DELETE of shot_generations rows.';

-- Step 6: Backfill existing data
-- ============================================================================
DO $$
DECLARE
  v_updated_count INTEGER;
  v_total_count INTEGER;
BEGIN
  RAISE NOTICE '[BACKFILL] Starting backfill of shot data to generations.shot_data...';
  
  -- Get total count of shot_generations
  SELECT COUNT(*) INTO v_total_count FROM shot_generations;
  RAISE NOTICE '[BACKFILL] Found % shot_generation records to backfill', v_total_count;
  
  -- Build JSONB for each generation by aggregating all their shots
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
  WHERE g.id = sa.generation_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RAISE NOTICE '[BACKFILL] Successfully updated % generations with shot data', v_updated_count;
  
  -- Verify backfill
  DECLARE
    v_gens_with_shots INTEGER;
  BEGIN
    SELECT COUNT(DISTINCT generation_id) INTO v_gens_with_shots FROM shot_generations;
    
    IF v_updated_count != v_gens_with_shots THEN
      RAISE WARNING '[BACKFILL] Mismatch: % unique generations in shot_generations but % updated',
        v_gens_with_shots, v_updated_count;
    ELSE
      RAISE NOTICE '[BACKFILL] ✅ Backfill complete! All shot data synced successfully.';
    END IF;
  END;
END $$;

-- Step 7: Create helper function to verify sync
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_shot_sync_jsonb()
RETURNS TABLE (
  generation_id UUID,
  expected_shot_data JSONB,
  actual_shot_data JSONB,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH expected AS (
    SELECT 
      sg.generation_id,
      jsonb_object_agg(sg.shot_id::text, sg.timeline_frame) as shot_data
    FROM shot_generations sg
    GROUP BY sg.generation_id
  )
  SELECT 
    COALESCE(e.generation_id, g.id) as generation_id,
    e.shot_data as expected_shot_data,
    g.shot_data as actual_shot_data,
    CASE 
      WHEN e.shot_data IS NULL AND g.shot_data = '{}'::jsonb THEN 'OK: No shots'
      WHEN e.shot_data = g.shot_data THEN 'OK: In Sync'
      WHEN e.shot_data IS NULL THEN 'MISMATCH: Generation has shot_data but no shot_generations'
      WHEN g.shot_data IS NULL OR g.shot_data = '{}'::jsonb THEN 'MISMATCH: Generation missing shot_data'
      ELSE 'MISMATCH: Data differs'
    END as status
  FROM expected e
  FULL OUTER JOIN generations g ON e.generation_id = g.id
  WHERE e.shot_data IS DISTINCT FROM g.shot_data
     OR (e.shot_data IS NULL AND g.shot_data != '{}'::jsonb)
     OR (e.shot_data IS NOT NULL AND (g.shot_data IS NULL OR g.shot_data = '{}'::jsonb));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_shot_sync_jsonb IS
'Debugging function to find any generations where shot_data is out of sync with shot_generations.
Should return 0 rows if everything is working correctly.';

-- Step 8: Create helper functions for common queries
-- ============================================================================

-- Check if generation is in a specific shot
CREATE OR REPLACE FUNCTION generation_in_shot(gen_id UUID, s_id UUID)
RETURNS BOOLEAN AS $$
  SELECT shot_data ? s_id::text
  FROM generations
  WHERE id = gen_id;
$$ LANGUAGE SQL STABLE;

-- Get frame for generation in specific shot (returns NULL if not in shot or unpositioned)
CREATE OR REPLACE FUNCTION get_generation_frame(gen_id UUID, s_id UUID)
RETURNS INTEGER AS $$
  SELECT (shot_data->>s_id::text)::INTEGER
  FROM generations
  WHERE id = gen_id;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Migration completed successfully!
-- 
-- What was done:
--   - Replaced shot_id/timeline_frame with shot_data JSONB column
--   - Created GIN index for fast shot lookups
--   - Created robust sync trigger on shot_generations  
--   - Backfilled existing data (supports multiple shots per generation)
--
-- To verify sync, run: SELECT * FROM verify_shot_sync_jsonb();
-- (Should return 0 rows if everything is in sync)
--
-- Query examples:
--   Find generations in a shot:
--     SELECT * FROM generations WHERE shot_data ? 'shot-uuid';
--
--   Find unpositioned generations in a shot:
--     SELECT * FROM generations 
--     WHERE shot_data ? 'shot-uuid' 
--     AND (shot_data->>'shot-uuid') IS NULL;
--
--   Find positioned generations in a shot:
--     SELECT * FROM generations 
--     WHERE shot_data ? 'shot-uuid' 
--     AND (shot_data->>'shot-uuid') IS NOT NULL;


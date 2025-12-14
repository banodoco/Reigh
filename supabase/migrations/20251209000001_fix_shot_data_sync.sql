-- ============================================================================
-- Migration: Fix shot_data JSONB sync from shot_generations
-- ============================================================================
-- Problem: The trigger sync_shot_to_generation() only updates scalar columns
-- (shot_id, timeline_frame) but NOT the shot_data JSONB column.
-- This causes mismatches between shot_generations.timeline_frame and shot_data.
--
-- Solution:
-- 1. Update the sync function to also maintain shot_data JSONB
-- 2. Backfill all existing data to fix mismatches
-- ============================================================================

-- Step 1: Update the sync function to also update shot_data JSONB
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_shot_to_generation()
RETURNS TRIGGER AS $$
DECLARE
  v_generation_id UUID;
  v_shot_id UUID;
  v_timeline_frame INTEGER;
  v_current_shot_data JSONB;
BEGIN
  -- Handle INSERT: New shot_generation created
  IF TG_OP = 'INSERT' THEN
    -- Get current shot_data
    SELECT shot_data INTO v_current_shot_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    -- Initialize if NULL
    IF v_current_shot_data IS NULL THEN
      v_current_shot_data := '{}'::jsonb;
    END IF;
    
    -- Update the generation with shot info (scalar columns + JSONB)
    UPDATE generations 
    SET shot_id = NEW.shot_id,
        timeline_frame = NEW.timeline_frame,
        shot_data = v_current_shot_data || jsonb_build_object(NEW.shot_id::text, NEW.timeline_frame)
    WHERE id = NEW.generation_id;
    
    RETURN NEW;
  
  -- Handle UPDATE: Shot assignment changed or frame moved
  ELSIF TG_OP = 'UPDATE' THEN
    -- Get current shot_data
    SELECT shot_data INTO v_current_shot_data
    FROM generations
    WHERE id = NEW.generation_id;
    
    -- Initialize if NULL
    IF v_current_shot_data IS NULL THEN
      v_current_shot_data := '{}'::jsonb;
    END IF;
    
    -- If shot changed, remove old shot from shot_data
    IF OLD.shot_id IS DISTINCT FROM NEW.shot_id AND OLD.shot_id IS NOT NULL THEN
      v_current_shot_data := v_current_shot_data - OLD.shot_id::text;
    END IF;
    
    -- Add/update new shot in shot_data
    v_current_shot_data := v_current_shot_data || jsonb_build_object(NEW.shot_id::text, NEW.timeline_frame);
    
    -- Update the generation with new shot info
    UPDATE generations 
    SET shot_id = NEW.shot_id,
        timeline_frame = NEW.timeline_frame,
        shot_data = v_current_shot_data
    WHERE id = NEW.generation_id;
    
    RETURN NEW;
  
  -- Handle DELETE: Shot_generation removed
  ELSIF TG_OP = 'DELETE' THEN
    -- Get current shot_data
    SELECT shot_data INTO v_current_shot_data
    FROM generations
    WHERE id = OLD.generation_id;
    
    -- Remove this shot from shot_data
    IF v_current_shot_data IS NOT NULL THEN
      v_current_shot_data := v_current_shot_data - OLD.shot_id::text;
    END IF;
    
    -- Check if there are OTHER shot_generations for this generation
    SELECT sg.shot_id, sg.timeline_frame
    INTO v_shot_id, v_timeline_frame
    FROM shot_generations sg
    WHERE sg.generation_id = OLD.generation_id
      AND sg.shot_id != OLD.shot_id
    LIMIT 1;
    
    IF FOUND THEN
      -- Another shot_generation exists, use that one for scalar columns
      UPDATE generations 
      SET shot_id = v_shot_id,
          timeline_frame = v_timeline_frame,
          shot_data = v_current_shot_data
      WHERE id = OLD.generation_id;
    ELSE
      -- No other shot_generations, clear the scalar fields
      UPDATE generations 
      SET shot_id = NULL,
          timeline_frame = NULL,
          shot_data = CASE WHEN v_current_shot_data = '{}'::jsonb THEN NULL ELSE v_current_shot_data END
      WHERE id = OLD.generation_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_shot_to_generation IS 
'Keeps generations.shot_id, generations.timeline_frame, AND generations.shot_data in sync with shot_generations table.
Updated 2024-12-09 to also maintain shot_data JSONB column.';

-- Step 2: Full backfill - rebuild shot_data from shot_generations for ALL generations
-- ============================================================================
-- This fixes any existing mismatches by completely rebuilding shot_data from the source of truth
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  RAISE NOTICE '[BackfillShotData] Starting full shot_data rebuild from shot_generations...';
  
  -- Rebuild shot_data for all generations that have shot_generations records
  WITH shot_mappings AS (
    SELECT 
      generation_id,
      jsonb_object_agg(shot_id::text, timeline_frame) as shot_data
    FROM shot_generations
    GROUP BY generation_id
  )
  UPDATE generations g
  SET shot_data = sm.shot_data
  FROM shot_mappings sm
  WHERE g.id = sm.generation_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '[BackfillShotData] Updated % generations with rebuilt shot_data', v_updated_count;
  
  -- Clear shot_data for generations that have NO shot_generations records
  -- but still have stale shot_data
  UPDATE generations g
  SET shot_data = NULL
  WHERE g.shot_data IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM shot_generations sg WHERE sg.generation_id = g.id
    );
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '[BackfillShotData] Cleared stale shot_data from % generations', v_updated_count;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What was done:
--   1. Updated sync_shot_to_generation() to also maintain shot_data JSONB
--   2. Rebuilt shot_data from shot_generations for all generations
--
-- NOTE: Multiple shot_generations records for the same (shot_id, generation_id)
-- pair is intentionally allowed - same image can appear multiple times in a shot.
-- ============================================================================








-- ============================================================================
-- Migration: Migrate shot_data from single value to array format
-- ============================================================================
-- Problem: shot_data stores { "shot_id": timeline_frame } (single value)
--          but code expects { "shot_id": [frame1, frame2, ...] } (array)
--          This causes data loss when duplicates exist and breaks filtering
--
-- Solution: Migrate to array format to match code expectations and support duplicates
-- ============================================================================

-- Step 1: Update the sync function to aggregate into arrays
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_shot_to_generation()
RETURNS TRIGGER AS $$
DECLARE
  v_generation_id UUID;
  v_shot_id UUID;
  v_timeline_frame INTEGER;
  v_current_shot_data JSONB;
  v_aggregated_data JSONB;
BEGIN
  -- Handle INSERT: New shot_generation created
  IF TG_OP = 'INSERT' THEN
    -- Rebuild shot_data from ALL shot_generations for this generation
    -- This ensures we capture all duplicates and maintain array format
    SELECT COALESCE(jsonb_object_agg(t.shot_id, t.frames), '{}'::jsonb)
    INTO v_aggregated_data
    FROM (
      SELECT
        sg.shot_id::text AS shot_id,
        jsonb_agg(sg.timeline_frame ORDER BY sg.timeline_frame NULLS LAST) AS frames
      FROM shot_generations sg
      WHERE sg.generation_id = NEW.generation_id
      GROUP BY sg.shot_id
    ) t;
    
    -- Initialize if no data found (shouldn't happen, but safe)
    IF v_aggregated_data IS NULL THEN
      v_aggregated_data := '{}'::jsonb;
    END IF;
    
    -- Get the primary shot_id and timeline_frame for scalar columns
    -- Use the most recent shot_generation record (best-effort representative)
    SELECT sg.shot_id, sg.timeline_frame
    INTO v_shot_id, v_timeline_frame
    FROM shot_generations sg
    WHERE sg.generation_id = NEW.generation_id
    ORDER BY sg.created_at DESC NULLS LAST, sg.id DESC
    LIMIT 1;
    
    -- Update the generation with aggregated shot_data and scalar columns
    UPDATE generations 
    SET shot_id = v_shot_id,
        timeline_frame = v_timeline_frame,
        shot_data = v_aggregated_data
    WHERE id = NEW.generation_id;
    
    RETURN NEW;
  
  -- Handle UPDATE: Shot assignment changed or frame moved
  ELSIF TG_OP = 'UPDATE' THEN
    -- Rebuild shot_data from ALL shot_generations for this generation
    SELECT COALESCE(jsonb_object_agg(t.shot_id, t.frames), '{}'::jsonb)
    INTO v_aggregated_data
    FROM (
      SELECT
        sg.shot_id::text AS shot_id,
        jsonb_agg(sg.timeline_frame ORDER BY sg.timeline_frame NULLS LAST) AS frames
      FROM shot_generations sg
      WHERE sg.generation_id = NEW.generation_id
      GROUP BY sg.shot_id
    ) t;
    
    -- Initialize if no data found
    IF v_aggregated_data IS NULL THEN
      v_aggregated_data := '{}'::jsonb;
    END IF;
    
    -- Get the primary shot_id and timeline_frame for scalar columns
    SELECT sg.shot_id, sg.timeline_frame
    INTO v_shot_id, v_timeline_frame
    FROM shot_generations sg
    WHERE sg.generation_id = NEW.generation_id
    ORDER BY sg.created_at DESC NULLS LAST, sg.id DESC
    LIMIT 1;
    
    -- Update the generation with new aggregated shot_data
    UPDATE generations 
    SET shot_id = v_shot_id,
        timeline_frame = v_timeline_frame,
        shot_data = v_aggregated_data
    WHERE id = NEW.generation_id;
    
    RETURN NEW;
  
  -- Handle DELETE: Shot_generation removed
  ELSIF TG_OP = 'DELETE' THEN
    -- Rebuild shot_data from REMAINING shot_generations
    SELECT COALESCE(jsonb_object_agg(t.shot_id, t.frames), '{}'::jsonb)
    INTO v_aggregated_data
    FROM (
      SELECT
        sg.shot_id::text AS shot_id,
        jsonb_agg(sg.timeline_frame ORDER BY sg.timeline_frame NULLS LAST) AS frames
      FROM shot_generations sg
      WHERE sg.generation_id = OLD.generation_id
      GROUP BY sg.shot_id
    ) t;
    
    -- Check if there are OTHER shot_generations for this generation
    SELECT sg.shot_id, sg.timeline_frame
    INTO v_shot_id, v_timeline_frame
    FROM shot_generations sg
    WHERE sg.generation_id = OLD.generation_id
    ORDER BY sg.created_at DESC NULLS LAST, sg.id DESC
    LIMIT 1;
    
    IF FOUND THEN
      -- Another shot_generation exists, use that one for scalar columns
      UPDATE generations 
      SET shot_id = v_shot_id,
          timeline_frame = v_timeline_frame,
          shot_data = v_aggregated_data
      WHERE id = OLD.generation_id;
    ELSE
      -- No other shot_generations, clear the scalar fields
      UPDATE generations 
      SET shot_id = NULL,
          timeline_frame = NULL,
          shot_data = NULL
      WHERE id = OLD.generation_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_shot_to_generation IS 
'Keeps generations.shot_id, generations.timeline_frame, AND generations.shot_data in sync with shot_generations table.
UPDATED 2024-12-21: Now aggregates into array format { "shot_id": [frame1, frame2, ...] } to support duplicates.';

-- Step 2: Backfill all existing shot_data to array format
-- ============================================================================
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  RAISE NOTICE '[MigrateShotData] Starting migration to array format...';
  
  -- Rebuild shot_data for all generations that have shot_generations records
  -- Aggregate all timeline_frames per shot_id into arrays
  WITH grouped_by_shot AS (
    SELECT 
      generation_id,
      shot_id::text as shot_id,
      jsonb_agg(timeline_frame ORDER BY timeline_frame NULLS LAST) as frames
    FROM shot_generations
    GROUP BY generation_id, shot_id
  ),
  aggregated_by_generation AS (
    SELECT 
      generation_id,
      jsonb_object_agg(shot_id, frames) as shot_data
    FROM grouped_by_shot
    GROUP BY generation_id
  )
  UPDATE generations g
  SET shot_data = agg.shot_data
  FROM aggregated_by_generation agg
  WHERE g.id = agg.generation_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '[MigrateShotData] Updated % generations with array-format shot_data', v_updated_count;
  
  -- Clear shot_data for generations that have NO shot_generations records
  UPDATE generations g
  SET shot_data = NULL
  WHERE g.shot_data IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM shot_generations sg WHERE sg.generation_id = g.id
    );
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '[MigrateShotData] Cleared stale shot_data from % generations', v_updated_count;
END $$;

-- Step 3: Verify migration
-- ============================================================================
DO $$
DECLARE
  v_single_value_count INTEGER;
  v_array_count INTEGER;
  v_total_count INTEGER;
BEGIN
  -- Count generations with single-value format (should be 0 after migration)
  SELECT COUNT(*) INTO v_single_value_count
  FROM generations
  WHERE shot_data IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(shot_data) AS e(key, value)
      WHERE jsonb_typeof(value) != 'array'
    );
  
  -- Count generations with array format (should match total)
  SELECT COUNT(*) INTO v_array_count
  FROM generations
  WHERE shot_data IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(shot_data) AS e(key, value)
      WHERE jsonb_typeof(value) != 'array'
    );
  
  -- Count total with shot_data
  SELECT COUNT(*) INTO v_total_count
  FROM generations
  WHERE shot_data IS NOT NULL;
  
  RAISE NOTICE '[MigrateShotData] Migration verification:';
  RAISE NOTICE '  Total generations with shot_data: %', v_total_count;
  RAISE NOTICE '  Array format: %', v_array_count;
  RAISE NOTICE '  Single-value format (should be 0): %', v_single_value_count;
  
  IF v_single_value_count > 0 THEN
    RAISE WARNING '[MigrateShotData] WARNING: % generations still have single-value format!', v_single_value_count;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What was done:
--   1. Updated sync_shot_to_generation() to aggregate into arrays
--   2. Migrated all existing shot_data to array format
--   3. Verified migration success
--
-- shot_data format is now: { "shot_id": [frame1, frame2, ...] }
-- This supports multiple entries per shot_id and matches code expectations.
-- ============================================================================

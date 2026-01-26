-- ============================================================================
-- Migration: Fix shot_data trigger to use array format
-- ============================================================================
-- Problem: sync_shot_to_generation_jsonb() stores single values like { "shot_id": 0 }
--          but code expects array format like { "shot_id": [0] }
--          This breaks the "exclude positioned" filter in GenerationsPane
--
-- Solution: Update the trigger to rebuild shot_data using jsonb_agg for arrays
-- ============================================================================

-- Step 1: Update the trigger function to use array format
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_shot_to_generation_jsonb()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_generation_id UUID;
  v_aggregated_data JSONB;
BEGIN
  -- Determine which generation_id to update
  IF TG_OP = 'DELETE' THEN
    v_generation_id := OLD.generation_id;
  ELSE
    v_generation_id := NEW.generation_id;
  END IF;

  -- Rebuild shot_data from ALL shot_generations for this generation
  -- This ensures we capture all duplicates and maintain array format
  -- Format: { "shot_id": [frame1, frame2, ...], ... }
  SELECT COALESCE(jsonb_object_agg(t.shot_id, t.frames), '{}'::jsonb)
  INTO v_aggregated_data
  FROM (
    SELECT
      sg.shot_id::text AS shot_id,
      jsonb_agg(sg.timeline_frame ORDER BY sg.timeline_frame NULLS LAST) AS frames
    FROM shot_generations sg
    WHERE sg.generation_id = v_generation_id
    GROUP BY sg.shot_id
  ) t;

  -- Update the generation with aggregated shot_data
  UPDATE generations
  SET shot_data = v_aggregated_data
  WHERE id = v_generation_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

COMMENT ON FUNCTION sync_shot_to_generation_jsonb IS
'Keeps generations.shot_data in sync with shot_generations table.
UPDATED 2026-01-26: Now uses jsonb_agg to create array format { "shot_id": [frame1, frame2] }
to support duplicates and match query filter expectations.';

-- Step 2: Backfill all existing shot_data to array format
-- ============================================================================
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  RAISE NOTICE '[FixShotData] Starting migration to array format...';

  -- Rebuild shot_data for ALL generations that have shot_generations records
  -- This converts single-value format to array format
  WITH aggregated AS (
    SELECT
      generation_id,
      jsonb_object_agg(shot_id, frames) as shot_data
    FROM (
      SELECT
        generation_id,
        shot_id::text as shot_id,
        jsonb_agg(timeline_frame ORDER BY timeline_frame NULLS LAST) as frames
      FROM shot_generations
      GROUP BY generation_id, shot_id
    ) grouped
    GROUP BY generation_id
  )
  UPDATE generations g
  SET shot_data = agg.shot_data
  FROM aggregated agg
  WHERE g.id = agg.generation_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '[FixShotData] Updated % generations with array-format shot_data', v_updated_count;

  -- Clear shot_data for generations that have NO shot_generations records
  -- (cleanup any stale data)
  UPDATE generations g
  SET shot_data = NULL
  WHERE g.shot_data IS NOT NULL
    AND g.shot_data != '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1 FROM shot_generations sg WHERE sg.generation_id = g.id
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count > 0 THEN
    RAISE NOTICE '[FixShotData] Cleared stale shot_data from % generations', v_updated_count;
  END IF;
END $$;

-- Step 3: Verify migration
-- ============================================================================
DO $$
DECLARE
  v_single_value_count INTEGER;
  v_array_count INTEGER;
BEGIN
  -- Count entries with single-value format (should be 0 after migration)
  SELECT COUNT(*) INTO v_single_value_count
  FROM generations
  WHERE shot_data IS NOT NULL
    AND shot_data != '{}'::jsonb
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(shot_data) AS e(key, value)
      WHERE jsonb_typeof(value) != 'array'
    );

  -- Count entries with array format
  SELECT COUNT(*) INTO v_array_count
  FROM generations
  WHERE shot_data IS NOT NULL
    AND shot_data != '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(shot_data) AS e(key, value)
      WHERE jsonb_typeof(value) != 'array'
    );

  RAISE NOTICE '[FixShotData] Verification:';
  RAISE NOTICE '  Array format (correct): %', v_array_count;
  RAISE NOTICE '  Single-value format (should be 0): %', v_single_value_count;

  IF v_single_value_count > 0 THEN
    RAISE WARNING '[FixShotData] WARNING: % generations still have single-value format!', v_single_value_count;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What was done:
--   1. Updated sync_shot_to_generation_jsonb() to use jsonb_agg for array format
--   2. Backfilled all existing shot_data to array format
--   3. Verified migration success
--
-- shot_data format is now: { "shot_id": [frame1, frame2, ...] }
-- ============================================================================

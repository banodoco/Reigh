-- Fix apply_timeline_frames to respect user_positioned metadata
-- This function was also overriding user drag operations

-- Drop the problematic function
DROP FUNCTION IF EXISTS apply_timeline_frames(uuid, jsonb, boolean);

-- Recreate with user_positioned protection
CREATE OR REPLACE FUNCTION apply_timeline_frames(
  p_shot_id uuid,
  p_changes jsonb,
  p_update_positions boolean DEFAULT true
)
RETURNS TABLE(
  id uuid,
  generation_id uuid,
  "position" integer,
  timeline_frame integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _change_count integer;
  _affected_count integer;
BEGIN
  -- Acquire advisory lock for this shot to serialize all position updates
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));

  -- Validate input
  IF p_changes IS NULL OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  -- Log the operation for debugging with unique identifier
  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'apply_timeline_frames_FIXED_v4: shot_id=%, changes=%, update_positions=%, respecting_user_positions=true',
    p_shot_id, _change_count, p_update_positions;

  -- Create a temporary table for the changes with validation
  CREATE TEMP TABLE temp_changes_debug AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as generation_id,
    (c->>'timeline_frame')::integer as timeline_frame
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  -- Validate that all generation_ids exist in this shot
  IF EXISTS (
    SELECT 1 FROM temp_changes_debug tc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tc.generation_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_changes_debug;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  -- Validate no duplicate timeline_frames in the payload
  IF (SELECT COUNT(*) FROM temp_changes_debug) != (SELECT COUNT(DISTINCT timeline_frame) FROM temp_changes_debug) THEN
    DROP TABLE temp_changes_debug;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  -- CRITICAL FIX: Skip user-positioned items completely
  DELETE FROM temp_changes_debug tc
  WHERE EXISTS (
    SELECT 1 FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id
      AND sg.generation_id = tc.generation_id
      AND (sg.metadata->>'user_positioned' = 'true' OR sg.metadata->>'drag_source' IS NOT NULL)
  );

  -- Only proceed if we have changes after filtering user-positioned items
  IF (SELECT COUNT(*) FROM temp_changes_debug) = 0 THEN
    RAISE LOG 'apply_timeline_frames_FIXED_v4: all changes were for user-positioned items, skipping';
    DROP TABLE temp_changes_debug;
    RETURN QUERY SELECT
      sg.id,
      sg.generation_id,
      sg.position,
      sg.timeline_frame,
      sg.updated_at
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id
    ORDER BY sg.timeline_frame ASC;
  END IF;

  -- Stage 1: Clear timeline_frame for all affected rows (excluding user-positioned)
  UPDATE shot_generations main_sg
  SET
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE main_sg.shot_id = p_shot_id
    AND main_sg.generation_id IN (SELECT tc.generation_id FROM temp_changes_debug tc)
    AND NOT (main_sg.metadata->>'user_positioned' = 'true' OR main_sg.metadata->>'drag_source' IS NOT NULL);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_FIXED_v4: cleared % non-user-positioned timeline_frames', _affected_count;

  -- Stage 2: Apply new timeline_frame values (only to non-user-positioned items)
  UPDATE shot_generations main_sg
  SET
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_changes_debug tc
  WHERE main_sg.shot_id = p_shot_id
    AND main_sg.generation_id = tc.generation_id
    AND NOT (main_sg.metadata->>'user_positioned' = 'true' OR main_sg.metadata->>'drag_source' IS NOT NULL);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_FIXED_v4: updated % non-user-positioned timeline_frames', _affected_count;

  -- Clean up temp table
  DROP TABLE temp_changes_debug;

  -- Stage 3: Reconcile position values if requested
  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT
        main_sg.id,
        ROW_NUMBER() OVER (
          ORDER BY
            main_sg.timeline_frame NULLS LAST,  -- EXPLICIT TABLE ALIAS
            main_sg.created_at ASC,
            main_sg.generation_id ASC
        ) - 1 as new_position
      FROM shot_generations main_sg  -- EXPLICIT ALIAS
      WHERE main_sg.shot_id = p_shot_id
    )
    UPDATE shot_generations update_sg
    SET
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE update_sg.id = oi.id
      AND NOT (update_sg.metadata->>'user_positioned' = 'true' OR update_sg.metadata->>'drag_source' IS NOT NULL);

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'apply_timeline_frames_FIXED_v4: reconciled % non-user-positioned positions', _affected_count;
  END IF;

  -- Return results
  RETURN QUERY SELECT
    sg.id,
    sg.generation_id,
    sg."position",
    sg.timeline_frame,
    sg.updated_at
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id
  ORDER BY sg.timeline_frame ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION apply_timeline_frames(uuid, jsonb, boolean) TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ FIXED: apply_timeline_frames now respects user_positioned metadata';
    RAISE NOTICE 'Bulk operations will no longer override user drag positions';
    RAISE NOTICE 'Function now skips any user-positioned items completely';
END $$;

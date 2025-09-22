-- Fix ambiguous column reference in apply_timeline_frames function
-- The timeline_frame column reference in the ORDER BY clause was ambiguous
-- This is a forced update to ensure the function is properly replaced

DROP FUNCTION IF EXISTS apply_timeline_frames(uuid, jsonb, boolean);

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
) AS $$
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

  -- Log the operation for debugging
  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'apply_timeline_frames: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  -- Create a temporary table for the changes with validation
  CREATE TEMP TABLE temp_changes AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as generation_id,
    (c->>'timeline_frame')::integer as timeline_frame
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0; -- Enforce non-negative constraint

  -- Validate that all generation_ids exist in this shot
  IF EXISTS (
    SELECT 1 FROM temp_changes tc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tc.generation_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_changes;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  -- Validate no duplicate timeline_frames in the payload
  IF (SELECT COUNT(*) FROM temp_changes) != (SELECT COUNT(DISTINCT timeline_frame) FROM temp_changes) THEN
    DROP TABLE temp_changes;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  -- Stage 1: Clear timeline_frame for all affected rows (partial unique index ignores NULL)
  UPDATE shot_generations sg
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE sg.shot_id = p_shot_id
    AND sg.generation_id IN (SELECT generation_id FROM temp_changes);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames: cleared % timeline_frames', _affected_count;

  -- Stage 2: Apply new timeline_frame values
  UPDATE shot_generations sg
  SET 
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_changes tc
  WHERE sg.shot_id = p_shot_id 
    AND sg.generation_id = tc.generation_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames: updated % timeline_frames', _affected_count;

  -- Stage 3: Reconcile position values if requested (keeps batch view consistent)
  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT 
        sg.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            sg.timeline_frame NULLS LAST,  -- FIX: Qualify with table alias
            sg.created_at ASC, 
            sg.generation_id ASC
        ) - 1 as new_position
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
    )
    UPDATE shot_generations sg
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE sg.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'apply_timeline_frames: reconciled % positions', _affected_count;
  END IF;

  -- Clean up temp table
  DROP TABLE temp_changes;

  -- Return updated rows for client reconciliation
  RETURN QUERY
  SELECT 
    sg.id,
    sg.generation_id,
    sg."position",
    sg.timeline_frame,
    sg.updated_at
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id
  ORDER BY sg."position" ASC;

  RAISE LOG 'apply_timeline_frames: completed successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION apply_timeline_frames(uuid, jsonb, boolean) TO authenticated;

-- Verify the fix
SELECT 'Fixed ambiguous column reference in apply_timeline_frames function v2' as status;

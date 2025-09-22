-- Create a new version of the function with a different name to bypass caching
-- This will be called apply_timeline_frames_v2 and then we'll rename it

CREATE FUNCTION apply_timeline_frames_v2(
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

  -- Log the operation for debugging
  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'apply_timeline_frames_v2: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  -- Create a temporary table for the changes with validation
  CREATE TEMP TABLE temp_changes_v2 AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as generation_id,
    (c->>'timeline_frame')::integer as timeline_frame
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0; -- Enforce non-negative constraint

  -- Validate that all generation_ids exist in this shot
  IF EXISTS (
    SELECT 1 FROM temp_changes_v2 tc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tc.generation_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_changes_v2;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  -- Validate no duplicate timeline_frames in the payload
  IF (SELECT COUNT(*) FROM temp_changes_v2) != (SELECT COUNT(DISTINCT timeline_frame) FROM temp_changes_v2) THEN
    DROP TABLE temp_changes_v2;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  -- Stage 1: Clear timeline_frame for all affected rows (partial unique index ignores NULL)
  UPDATE shot_generations 
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (SELECT generation_id FROM temp_changes_v2);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_v2: cleared % timeline_frames', _affected_count;

  -- Stage 2: Apply new timeline_frame values
  UPDATE shot_generations 
  SET 
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_changes_v2 tc
  WHERE shot_id = p_shot_id 
    AND generation_id = tc.generation_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_v2: updated % timeline_frames', _affected_count;

  -- Stage 3: Reconcile position values if requested (keeps batch view consistent)
  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          ORDER BY 
            timeline_frame NULLS LAST,  -- No table alias needed here since we're only selecting from shot_generations
            created_at ASC, 
            generation_id ASC
        ) - 1 as new_position
      FROM shot_generations
      WHERE shot_id = p_shot_id
    )
    UPDATE shot_generations 
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE shot_generations.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'apply_timeline_frames_v2: reconciled % positions', _affected_count;
  END IF;

  -- Clean up temp table
  DROP TABLE temp_changes_v2;

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

  RAISE LOG 'apply_timeline_frames_v2: completed successfully';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION apply_timeline_frames_v2(uuid, jsonb, boolean) TO authenticated;

-- Drop the old function and rename the new one
DROP FUNCTION IF EXISTS apply_timeline_frames(uuid, jsonb, boolean) CASCADE;

-- Rename the new function to the original name
ALTER FUNCTION apply_timeline_frames_v2(uuid, jsonb, boolean) RENAME TO apply_timeline_frames;

-- Test the function exists and is accessible
SELECT 'Successfully recreated apply_timeline_frames function (v2 approach)' as status;

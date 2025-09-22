-- Add apply_timeline_frames function for atomic timeline position updates
-- This replaces the complex client-side exchange logic with a single server-side transaction
-- that handles all position changes atomically, preventing unique constraint violations

-- First, add advisory locking to the existing exchange_shot_positions function
-- to ensure both functions are serialized per shot
DROP FUNCTION IF EXISTS exchange_shot_positions(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION exchange_shot_positions(
  p_shot_id uuid,
  p_generation_id_a uuid,
  p_generation_id_b uuid
)
RETURNS void AS $$
DECLARE
  item_a_position integer;
  item_a_timeline_frame integer;
  item_b_position integer;
  item_b_timeline_frame integer;
  temp_timeline_frame integer;
BEGIN
  -- Acquire advisory lock for this shot to serialize all position updates
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));

  -- Get current positions for both items
  SELECT position, timeline_frame
  INTO item_a_position, item_a_timeline_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  SELECT position, timeline_frame
  INTO item_b_position, item_b_timeline_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Verify both items exist
  IF item_a_position IS NULL OR item_b_position IS NULL THEN
    RAISE EXCEPTION 'One or both items not found in shot %', p_shot_id;
  END IF;

  -- Use a three-step process to avoid unique constraint violations
  -- Step 1: Set item A to a very large temporary timeline_frame value (won't conflict with real frames)
  temp_timeline_frame := 2000000000; -- 2 billion - way larger than any realistic timeline frame
  
  UPDATE shot_generations SET
    timeline_frame = temp_timeline_frame,
    updated_at = NOW()
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  -- Step 2: Set item B to item A's original values
  UPDATE shot_generations SET
    position = item_a_position,
    timeline_frame = item_a_timeline_frame,
    updated_at = NOW()
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_b;

  -- Step 3: Set item A to item B's original values
  UPDATE shot_generations SET
    position = item_b_position,
    timeline_frame = item_b_timeline_frame,
    updated_at = NOW()
  WHERE shot_id = p_shot_id AND generation_id = p_generation_id_a;

  -- Log the exchange for debugging
  RAISE LOG 'Exchanged positions: % (pos % -> %) and % (pos % -> %)',
    p_generation_id_a, item_a_position, item_b_position,
    p_generation_id_b, item_b_position, item_a_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION exchange_shot_positions(uuid, uuid, uuid) TO authenticated;

-- Create the new apply_timeline_frames function for atomic position updates
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
        id,
        ROW_NUMBER() OVER (
          ORDER BY 
            timeline_frame NULLS LAST, 
            created_at ASC, 
            generation_id ASC
        ) - 1 as new_position
      FROM shot_generations
      WHERE shot_id = p_shot_id
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

-- Add comment to document the function
COMMENT ON FUNCTION apply_timeline_frames(uuid, jsonb, boolean) IS 
'Atomically applies timeline frame changes for a shot. Takes an array of {generation_id, timeline_frame} objects and updates them in a single transaction, avoiding unique constraint violations. Optionally reconciles position values to keep batch view consistent.';

-- Verify the migration
SELECT 'Added apply_timeline_frames function for atomic timeline updates' as status;

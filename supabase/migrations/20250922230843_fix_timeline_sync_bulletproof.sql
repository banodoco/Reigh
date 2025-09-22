-- Fix timeline_sync_bulletproof function to not reference position column
-- Replace position references with timeline_frame since position column was dropped

DROP FUNCTION IF EXISTS timeline_sync_bulletproof(uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION timeline_sync_bulletproof(
  shot_uuid uuid,
  frame_changes jsonb,
  should_update_positions boolean DEFAULT true
)
RETURNS TABLE(
  record_id uuid,
  gen_uuid uuid,
  frame_value integer,
  last_updated timestamptz
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  change_count integer;
  affected_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(shot_uuid::text));

  IF frame_changes IS NULL OR jsonb_array_length(frame_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  SELECT jsonb_array_length(frame_changes) INTO change_count;
  RAISE LOG 'timeline_sync_bulletproof: shot=%, changes=%, update_pos=%', 
    shot_uuid, change_count, should_update_positions;

  CREATE TEMP TABLE temp_updates AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as update_gen_id,
    (c->>'timeline_frame')::integer as update_frame
  FROM jsonb_array_elements(frame_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  IF EXISTS (
    SELECT 1 FROM temp_updates tu
    LEFT JOIN shot_generations sg ON (sg.shot_id = shot_uuid AND sg.generation_id = tu.update_gen_id)
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_updates;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', shot_uuid;
  END IF;

  IF (SELECT COUNT(*) FROM temp_updates) != (SELECT COUNT(DISTINCT update_frame) FROM temp_updates) THEN
    DROP TABLE temp_updates;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes array for shot %', shot_uuid;
  END IF;

  -- Update the timeline frames
  UPDATE shot_generations
  SET
    timeline_frame = temp_updates.update_frame,
    updated_at = NOW()
  FROM temp_updates
  WHERE shot_generations.id = (
    SELECT sg.id FROM shot_generations sg
    WHERE sg.shot_id = shot_uuid AND sg.generation_id = temp_updates.update_gen_id
    LIMIT 1
  );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE LOG 'timeline_sync_bulletproof: updated % frames', affected_rows;

  DROP TABLE temp_updates;

  RETURN QUERY
  SELECT
    sg.id as record_id,
    sg.generation_id as gen_uuid,
    sg.timeline_frame as frame_value,
    sg.updated_at as last_updated
  FROM shot_generations sg
  WHERE sg.shot_id = shot_uuid
  ORDER BY sg.timeline_frame ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION timeline_sync_bulletproof(uuid, jsonb, boolean) TO authenticated;

-- Verify the fix
SELECT 'Fixed timeline_sync_bulletproof function to not reference position column' as status;

CREATE FUNCTION timeline_position_sync(
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
  PERFORM pg_advisory_xact_lock(hashtext(p_shot_id::text));

  IF p_changes IS NULL OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'Changes array cannot be null or empty';
  END IF;

  SELECT jsonb_array_length(p_changes) INTO _change_count;
  RAISE LOG 'timeline_position_sync_CLEAN: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  CREATE TEMP TABLE temp_frame_changes AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as gen_id,
    (c->>'timeline_frame')::integer as frame_value
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  IF EXISTS (
    SELECT 1 FROM temp_frame_changes tfc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tfc.gen_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_frame_changes;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  IF (SELECT COUNT(*) FROM temp_frame_changes) != (SELECT COUNT(DISTINCT frame_value) FROM temp_frame_changes) THEN
    DROP TABLE temp_frame_changes;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  UPDATE shot_generations 
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (SELECT gen_id FROM temp_frame_changes);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'timeline_position_sync_CLEAN: cleared % timeline_frames', _affected_count;

  UPDATE shot_generations 
  SET 
    timeline_frame = tfc.frame_value,
    updated_at = NOW()
  FROM temp_frame_changes tfc
  WHERE shot_id = p_shot_id 
    AND generation_id = tfc.gen_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'timeline_position_sync_CLEAN: updated % timeline_frames', _affected_count;

  IF p_update_positions THEN
    WITH ordered_items AS (
      SELECT 
        sg.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            sg.timeline_frame NULLS LAST,
            sg.created_at ASC, 
            sg.generation_id ASC
        ) - 1 as new_position
      FROM shot_generations sg
      WHERE sg.shot_id = p_shot_id
    )
    UPDATE shot_generations 
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE shot_generations.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'timeline_position_sync_CLEAN: reconciled % positions', _affected_count;
  END IF;

  DROP TABLE temp_frame_changes;

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

  RAISE LOG 'timeline_position_sync_CLEAN: completed successfully';
END;
$$;

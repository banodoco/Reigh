CREATE FUNCTION atomic_timeline_update(
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
  RAISE LOG 'atomic_timeline_update: shot_id=%, changes=%, update_positions=%', 
    p_shot_id, _change_count, p_update_positions;

  CREATE TEMP TABLE temp_atomic_changes AS
  SELECT DISTINCT
    (c->>'generation_id')::uuid as generation_id,
    (c->>'timeline_frame')::integer as timeline_frame
  FROM jsonb_array_elements(p_changes) c
  WHERE (c->>'generation_id') IS NOT NULL 
    AND (c->>'timeline_frame') IS NOT NULL
    AND (c->>'timeline_frame')::integer >= 0;

  IF EXISTS (
    SELECT 1 FROM temp_atomic_changes tc
    LEFT JOIN shot_generations sg ON sg.shot_id = p_shot_id AND sg.generation_id = tc.generation_id
    WHERE sg.generation_id IS NULL
  ) THEN
    DROP TABLE temp_atomic_changes;
    RAISE EXCEPTION 'One or more generation_ids not found in shot %', p_shot_id;
  END IF;

  IF (SELECT COUNT(*) FROM temp_atomic_changes) != (SELECT COUNT(DISTINCT timeline_frame) FROM temp_atomic_changes) THEN
    DROP TABLE temp_atomic_changes;
    RAISE EXCEPTION 'Duplicate timeline_frame values in changes payload';
  END IF;

  UPDATE shot_generations 
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE shot_id = p_shot_id
    AND generation_id IN (SELECT generation_id FROM temp_atomic_changes);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'atomic_timeline_update: cleared % timeline_frames', _affected_count;

  UPDATE shot_generations 
  SET 
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_atomic_changes tc
  WHERE shot_id = p_shot_id 
    AND generation_id = tc.generation_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'atomic_timeline_update: updated % timeline_frames', _affected_count;

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
    UPDATE shot_generations 
    SET 
      "position" = oi.new_position,
      updated_at = NOW()
    FROM ordered_items oi
    WHERE shot_generations.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'atomic_timeline_update: reconciled % positions', _affected_count;
  END IF;

  DROP TABLE temp_atomic_changes;

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

  RAISE LOG 'atomic_timeline_update: completed successfully';
END;
$$;

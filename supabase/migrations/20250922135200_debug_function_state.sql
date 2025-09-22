-- Debug what functions exist and force a complete cleanup
DO $$
DECLARE
    func_record RECORD;
    func_count INTEGER;
BEGIN
    -- Log all existing functions with this name
    RAISE LOG '=== DEBUGGING FUNCTION STATE ===';
    
    SELECT COUNT(*) INTO func_count
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE p.proname = 'apply_timeline_frames' AND n.nspname = 'public';
    
    RAISE LOG 'Found % functions named apply_timeline_frames', func_count;
    
    -- Log details of each function
    FOR func_record IN 
        SELECT p.oid, p.proname, p.pronargs, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.proname = 'apply_timeline_frames' AND n.nspname = 'public'
    LOOP
        RAISE LOG 'Function: oid=%, name=%, args=%, pronargs=%', 
            func_record.oid, func_record.proname, func_record.args, func_record.pronargs;
    END LOOP;
    
    -- Drop ALL versions by OID to be absolutely sure
    FOR func_record IN 
        SELECT p.oid
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.proname = 'apply_timeline_frames' AND n.nspname = 'public'
    LOOP
        RAISE LOG 'Dropping function with OID: %', func_record.oid;
        EXECUTE format('DROP FUNCTION %s CASCADE', func_record.oid::regprocedure);
    END LOOP;
    
    RAISE LOG '=== CLEANUP COMPLETE ===';
END $$;

-- Wait to ensure cleanup is complete
SELECT pg_sleep(0.5);

-- Now create the function with EXPLICIT table aliases everywhere
CREATE FUNCTION apply_timeline_frames(
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
  RAISE LOG 'apply_timeline_frames_FIXED_v3: shot_id=%, changes=%, update_positions=%', 
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

  -- Stage 1: Clear timeline_frame for all affected rows
  UPDATE shot_generations main_sg
  SET 
    timeline_frame = NULL,
    updated_at = NOW()
  WHERE main_sg.shot_id = p_shot_id
    AND main_sg.generation_id IN (SELECT tc.generation_id FROM temp_changes_debug tc);

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_FIXED_v3: cleared % timeline_frames', _affected_count;

  -- Stage 2: Apply new timeline_frame values
  UPDATE shot_generations main_sg
  SET 
    timeline_frame = tc.timeline_frame,
    updated_at = NOW()
  FROM temp_changes_debug tc
  WHERE main_sg.shot_id = p_shot_id 
    AND main_sg.generation_id = tc.generation_id;

  GET DIAGNOSTICS _affected_count = ROW_COUNT;
  RAISE LOG 'apply_timeline_frames_FIXED_v3: updated % timeline_frames', _affected_count;

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
    WHERE update_sg.id = oi.id;

    GET DIAGNOSTICS _affected_count = ROW_COUNT;
    RAISE LOG 'apply_timeline_frames_FIXED_v3: reconciled % positions', _affected_count;
  END IF;

  -- Clean up temp table
  DROP TABLE temp_changes_debug;

  -- Return updated rows for client reconciliation
  RETURN QUERY
  SELECT 
    result_sg.id,
    result_sg.generation_id,
    result_sg."position",
    result_sg.timeline_frame,
    result_sg.updated_at
  FROM shot_generations result_sg  -- EXPLICIT ALIAS
  WHERE result_sg.shot_id = p_shot_id
  ORDER BY result_sg."position" ASC;

  RAISE LOG 'apply_timeline_frames_FIXED_v3: completed successfully';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION apply_timeline_frames(uuid, jsonb, boolean) TO authenticated;

-- Log completion
SELECT 'Successfully recreated apply_timeline_frames with explicit aliases (v3)' as status;

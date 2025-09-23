-- Comprehensive fix for ALL database functions to use timeline_frame instead of position
-- This migration updates every function that still references the position column

-- 1. Fix create_shot_with_image function
DROP FUNCTION IF EXISTS create_shot_with_image(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION create_shot_with_image(
  p_project_id UUID,
  p_shot_name TEXT,
  p_generation_id UUID
) RETURNS TABLE (
  shot_id UUID,
  shot_name TEXT,
  shot_generation_id UUID,
  success BOOLEAN
) AS $$
DECLARE
  v_shot_id UUID;
  v_shot_generation_id UUID;
BEGIN
  -- Create the shot first
  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;
  
  -- Add the generation to the shot with timeline_frame 0 (first image)
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
  VALUES (v_shot_id, p_generation_id, 0)
  RETURNING id INTO v_shot_generation_id;
  
  -- Return the results
  RETURN QUERY SELECT 
    v_shot_id,
    p_shot_name,
    v_shot_generation_id,
    TRUE;
    
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN QUERY SELECT 
    NULL::UUID,
    NULL::TEXT,
    NULL::UUID,
    FALSE;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix ensure_shot_association_from_params function
DROP FUNCTION IF EXISTS ensure_shot_association_from_params(uuid, jsonb);

CREATE OR REPLACE FUNCTION ensure_shot_association_from_params(
    p_generation_id uuid,
    p_params jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    shot_exists boolean;
    association_exists boolean;
    extracted_shot_id uuid;
BEGIN
    -- Extract shot_id from params (same as before)
    extracted_shot_id := COALESCE(
        (p_params->>'shot_id')::uuid,
        (p_params->'originalParams'->>'shot_id')::uuid,
        (p_params->'full_orchestrator_payload'->>'shot_id')::uuid,
        (p_params->'originalParams'->'full_orchestrator_payload'->>'shot_id')::uuid,
        (p_params->'orchestrator_details'->>'shot_id')::uuid,
        (p_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid
    );
    
    -- Return false if no shot_id found
    IF extracted_shot_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if shot exists
    SELECT EXISTS (
        SELECT 1 FROM shots WHERE id = extracted_shot_id
    ) INTO shot_exists;
    
    -- Check if association already exists
    SELECT EXISTS (
        SELECT 1 FROM shot_generations 
        WHERE shot_id = extracted_shot_id AND generation_id = p_generation_id
    ) INTO association_exists;
    
    -- Create association if shot exists and no association exists
    IF shot_exists AND NOT association_exists THEN
        -- Insert without timeline_frame (unpositioned by default)
        INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
        VALUES (extracted_shot_id, p_generation_id, NULL);
        
        RETURN true;
    END IF;
    
    RETURN association_exists;
END;
$$;

-- 3. Fix any database triggers that reference position
-- Update the generation trigger to use timeline_frame
CREATE OR REPLACE FUNCTION process_task_result()
RETURNS TRIGGER AS $$
DECLARE
    shot_id uuid;
    add_in_position boolean;
    new_generation_id uuid;
    next_timeline_frame integer;
BEGIN
    -- Skip if this is not a generation task result
    IF NEW.result IS NULL OR NEW.result->>'location' IS NULL THEN
        RETURN NEW;
    END IF;

    -- Extract shot_id from task params
    shot_id := COALESCE(
        (NEW.params->>'shot_id')::uuid,
        (NEW.params->'originalParams'->>'shot_id')::uuid,
        (NEW.params->'full_orchestrator_payload'->>'shot_id')::uuid,
        (NEW.params->'originalParams'->'full_orchestrator_payload'->>'shot_id')::uuid,
        (NEW.params->'orchestrator_details'->>'shot_id')::uuid,
        (NEW.params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid
    );

    -- Extract add_in_position flag
    add_in_position := COALESCE(
        (NEW.params->>'add_in_position')::boolean,
        (NEW.params->'originalParams'->>'add_in_position')::boolean,
        (NEW.params->'full_orchestrator_payload'->>'add_in_position')::boolean,
        (NEW.params->'originalParams'->'full_orchestrator_payload'->>'add_in_position')::boolean,
        (NEW.params->'orchestrator_details'->>'add_in_position')::boolean,
        (NEW.params->'originalParams'->'orchestrator_details'->>'add_in_position')::boolean,
        true -- Default to true if not specified
    );

    -- Create generation record first
    INSERT INTO generations (location, type, project_id, params, thumbnail_url)
    VALUES (
        NEW.result->>'location',
        COALESCE(NEW.result->>'type', 'image'),
        NEW.project_id,
        NEW.result,
        NEW.result->>'thumbnail_url'
    )
    RETURNING id INTO new_generation_id;

    -- Link to shot if shot_id exists
    IF shot_id IS NOT NULL THEN
        IF add_in_position THEN
            -- Calculate next timeline_frame, but only consider items that haven't been manually positioned
            SELECT COALESCE(MAX(timeline_frame), -50) + 50
            INTO next_timeline_frame
            FROM shot_generations
            WHERE shot_id = shot_id
              AND (metadata->>'user_positioned' IS NULL AND metadata->>'drag_source' IS NULL);

            INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
            VALUES (shot_id, new_generation_id, next_timeline_frame, jsonb_build_object('auto_positioned', true));

            RAISE LOG '[ProcessTask] Linked generation % to shot % at timeline_frame %', new_generation_id, shot_id, next_timeline_frame;
        ELSE
            -- Create shot_generations link without timeline_frame (unpositioned)
            INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
            VALUES (shot_id, new_generation_id, NULL, '{}'::jsonb);

            RAISE LOG '[ProcessTask] Linked generation % to shot % without timeline_frame', new_generation_id, shot_id;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[ProcessTask] Error processing task result: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Fix any remaining functions that might reference position
-- Drop and recreate initialize_timeline_frames_for_shot to ensure it's correct
DROP FUNCTION IF EXISTS initialize_timeline_frames_for_shot(uuid, integer);

CREATE OR REPLACE FUNCTION initialize_timeline_frames_for_shot(
  p_shot_id uuid,
  p_frame_spacing integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  records_updated integer := 0;
  max_existing_frame integer;
  current_frame integer;
BEGIN
  -- Get the maximum existing timeline_frame for this shot
  SELECT COALESCE(MAX(timeline_frame), -50)
  INTO max_existing_frame
  FROM shot_generations
  WHERE shot_id = p_shot_id AND timeline_frame IS NOT NULL;

  -- Update records that have NULL timeline_frame
  WITH ordered_records AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM shot_generations
    WHERE shot_id = p_shot_id AND timeline_frame IS NULL
  )
  UPDATE shot_generations
  SET timeline_frame = max_existing_frame + (ordered_records.rn * p_frame_spacing)
  FROM ordered_records
  WHERE shot_generations.id = ordered_records.id;

  GET DIAGNOSTICS records_updated = ROW_COUNT;
  
  RETURN records_updated;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_shot_with_image(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_shot_association_from_params(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_timeline_frames_for_shot(uuid, integer) TO authenticated;

-- Add comments
COMMENT ON FUNCTION create_shot_with_image IS 'Creates a shot and adds the first generation at timeline_frame 0. Updated to use timeline_frame instead of position.';
COMMENT ON FUNCTION ensure_shot_association_from_params IS 'Creates shot associations from generation params. Updated to use timeline_frame instead of position.';
COMMENT ON FUNCTION process_task_result IS 'Processes task results and creates shot associations. Updated to use timeline_frame instead of position.';
COMMENT ON FUNCTION initialize_timeline_frames_for_shot IS 'Initializes timeline_frame values for shot_generations that have NULL values.';

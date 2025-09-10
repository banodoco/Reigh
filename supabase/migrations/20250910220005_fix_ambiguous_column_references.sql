-- Fix ambiguous column references in functions
-- Error 42702: column reference "shot_id" is ambiguous

-- Fix ensure_shot_association_from_params - qualify all column references
CREATE OR REPLACE FUNCTION ensure_shot_association_from_params(
    p_generation_id uuid,
    p_params jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    extracted_shot_id uuid;
    shot_exists boolean := false;
    association_exists boolean := false;
BEGIN
    -- Try to extract shot_id from various locations in params
    extracted_shot_id := COALESCE(
        (p_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid,
        (p_params->>'shot_id')::uuid,
        (p_params->'full_orchestrator_payload'->>'shot_id')::uuid
    );
    
    -- If no shot_id found, return false
    IF extracted_shot_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if shot exists - fully qualify column reference
    SELECT EXISTS(SELECT 1 FROM shots s WHERE s.id = extracted_shot_id) INTO shot_exists;
    
    -- Check if association already exists - fully qualify all column references
    SELECT EXISTS(
        SELECT 1 FROM shot_generations sg 
        WHERE sg.shot_id = extracted_shot_id AND sg.generation_id = p_generation_id
    ) INTO association_exists;
    
    -- Create association if shot exists and no association exists
    IF shot_exists AND NOT association_exists THEN
        INSERT INTO shot_generations (shot_id, generation_id, position)
        VALUES (extracted_shot_id, p_generation_id, NULL);
        
        RETURN true;
    END IF;
    
    RETURN association_exists;
END;
$$;

-- Fix any other functions that might have ambiguous column references
-- Update create_generation_on_task_complete to ensure all column references are qualified
CREATE OR REPLACE FUNCTION create_generation_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
    new_generation_id uuid;
    generation_type text;
    generation_params jsonb;
    normalized_params jsonb;
    shot_id uuid;
    add_in_position boolean := true; -- Default to true for positioned associations
    output_location text;
    thumbnail_url text;
    task_category text;
    task_tool_type text;
BEGIN
    -- Get task metadata from task_types table - fully qualify column references
    SELECT tt.category, tt.tool_type INTO task_category, task_tool_type
    FROM task_types tt 
    WHERE tt.name = NEW.task_type;

    -- Process ANY completed task that doesn't have a generation yet AND has category = 'generation'
    IF NEW.status = 'Complete'::task_status
       AND NEW.generation_created = FALSE
       AND task_category = 'generation' THEN

        RAISE LOG '[ProcessTask] Processing completed generation task % (type: %, tool_type: %)', NEW.id, NEW.task_type, task_tool_type;

        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);

        -- Generate a new UUID for the generation
        new_generation_id := gen_random_uuid();

        -- FIXED: Extract shot_id with comprehensive search including originalParams wrapper
        BEGIN
            -- PRIORITY 1: Check originalParams.orchestrator_details.shot_id (MOST COMMON for wan_2_2_i2v)
            shot_id := (normalized_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid;
            
            -- Also check for add_in_position in originalParams.orchestrator_details
            IF (normalized_params->'originalParams'->'orchestrator_details'->>'add_in_position')::boolean IS NOT NULL THEN
                add_in_position := (normalized_params->'originalParams'->'orchestrator_details'->>'add_in_position')::boolean;
            END IF;

            -- PRIORITY 2: If not found, check orchestrator_details.shot_id (direct)
            IF shot_id IS NULL THEN
                shot_id := (normalized_params->'orchestrator_details'->>'shot_id')::uuid;
                
                -- Check for add_in_position in orchestrator_details
                IF add_in_position = true AND (normalized_params->'orchestrator_details'->>'add_in_position')::boolean IS NOT NULL THEN
                    add_in_position := (normalized_params->'orchestrator_details'->>'add_in_position')::boolean;
                END IF;
            END IF;

            -- PRIORITY 3: If still not found, try other locations based on task type
            IF shot_id IS NULL THEN
                IF NEW.task_type = 'travel_stitch' THEN
                    -- For travel_stitch, try full_orchestrator_payload as fallback
                    shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;

                    -- Check for add_in_position in full_orchestrator_payload
                    IF add_in_position = true AND (normalized_params->'full_orchestrator_payload'->>'add_in_position')::boolean IS NOT NULL THEN
                        add_in_position := (normalized_params->'full_orchestrator_payload'->>'add_in_position')::boolean;
                    END IF;
                ELSE
                    -- For other task types, try top-level shot_id
                    shot_id := (normalized_params->>'shot_id')::uuid;
                    
                    -- Check for add_in_position at top level
                    IF add_in_position = true AND (normalized_params->>'add_in_position')::boolean IS NOT NULL THEN
                        add_in_position := (normalized_params->>'add_in_position')::boolean;
                    END IF;
                END IF;
            END IF;
        EXCEPTION 
            WHEN invalid_text_representation OR data_exception THEN
                shot_id := NULL; -- Continue without shot linking
                RAISE LOG '[ProcessTask] Invalid shot_id format in % task %, continuing without shot link', NEW.task_type, NEW.id;
        END;

        -- Determine generation type based on task type and tool_type
        IF task_tool_type = 'travel-between-images' THEN
            generation_type := 'video_travel_output';
        ELSIF task_tool_type = 'image-generation' THEN
            generation_type := 'single_image';
        ELSIF task_tool_type = 'magic-edit' THEN
            generation_type := 'image_edit';
        ELSIF task_tool_type = 'edit-travel' THEN
            generation_type := 'edit_travel';
        ELSE
            -- Default fallback based on task type
            generation_type := CASE 
                WHEN NEW.task_type IN ('travel_stitch', 'wan_2_2_i2v') THEN 'video_travel_output'
                ELSE 'single_image'
            END;
        END IF;

        -- Extract thumbnail_url from params based on task type and structure
        BEGIN
            -- Try originalParams.orchestrator_details first (most common for wan_2_2_i2v)
            thumbnail_url := normalized_params->'originalParams'->'orchestrator_details'->>'thumbnail_url';
            
            -- If not found, try other locations
            IF thumbnail_url IS NULL THEN
                IF NEW.task_type = 'wan_2_2_i2v' THEN
                    thumbnail_url := normalized_params->'orchestrator_details'->>'thumbnail_url';
                ELSIF NEW.task_type = 'travel_stitch' THEN
                    thumbnail_url := normalized_params->'full_orchestrator_payload'->>'thumbnail_url';
                ELSE
                    thumbnail_url := normalized_params->>'thumbnail_url';
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            thumbnail_url := NULL;
        END;

        -- Validate required fields
        output_location := NEW.output_location;
        IF output_location IS NULL OR NEW.project_id IS NULL THEN
            RAISE LOG '[ProcessTask] Missing critical data for % task %: output_location=%, project_id=%',
                NEW.task_type, NEW.id, output_location, NEW.project_id;
            RETURN NEW;
        END IF;

        -- Build generation params
        generation_params := jsonb_build_object(
            'type', NEW.task_type,
            'projectId', NEW.project_id,
            'outputLocation', output_location,
            'originalParams', normalized_params,
            'tool_type', task_tool_type
        );

        -- Add shot_id if present and valid
        IF shot_id IS NOT NULL THEN
            generation_params := generation_params || jsonb_build_object('shotId', shot_id);
        END IF;

        -- Add thumbnail_url to params if available
        IF thumbnail_url IS NOT NULL THEN
            generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
        END IF;

        -- Insert the generation record
        INSERT INTO generations (
            id,
            tasks,
            params,
            location,
            type,
            project_id,
            thumbnail_url,
            created_at
        ) VALUES (
            new_generation_id,
            to_jsonb(ARRAY[NEW.id]),
            generation_params,
            output_location,
            generation_type,
            NEW.project_id,
            thumbnail_url,
            NOW()
        );

        -- Link generation to shot if shot_id exists and is valid
        IF shot_id IS NOT NULL THEN
            -- Use add_in_position to determine if we should position the generation
            PERFORM add_generation_to_shot(shot_id, new_generation_id, add_in_position);
            RAISE LOG '[ProcessTask] Created shot_generation link for shot % and generation % with positioning=%', 
                shot_id, new_generation_id, add_in_position;
        ELSE
            RAISE LOG '[ProcessTask] No shot_generation link created - shot_id is NULL for task %', NEW.id;
        END IF;

        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;

        RAISE LOG '[ProcessTask] Created generation % for % task % with tool_type: %, type: %, shot_id: %, thumbnail_url: %', 
            new_generation_id, NEW.task_type, NEW.id, task_tool_type, generation_type, 
            COALESCE(shot_id::text, 'none'), COALESCE(thumbnail_url, 'none');
    ELSE
        -- Log why task was skipped for debugging
        IF NEW.status = 'Complete'::task_status AND NEW.generation_created = FALSE THEN
            RAISE LOG '[ProcessTask] Skipping task % (type: %) - not a generation task (category: %)', 
                NEW.id, NEW.task_type, COALESCE(task_category, 'unknown');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the fix
COMMENT ON FUNCTION ensure_shot_association_from_params IS 
'Fixed ambiguous column references by fully qualifying all table.column references';

COMMENT ON FUNCTION create_generation_on_task_complete IS 
'Fixed ambiguous column references by fully qualifying all table.column references';

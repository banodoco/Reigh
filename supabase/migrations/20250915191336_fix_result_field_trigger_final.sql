-- Fix the trigger function to use the correct field name and logic
-- The function was trying to access NEW.result but should use NEW.output_location directly
-- as set by the complete_task edge function

CREATE OR REPLACE FUNCTION create_generation_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
    new_generation_id uuid;
    generation_type text;
    generation_params jsonb;
    normalized_params jsonb;
    extracted_shot_id uuid; -- RENAMED from shot_id to avoid ambiguity
    add_in_position boolean := false; -- DEFAULT CHANGED: false for unpositioned associations
    output_location text;
    thumbnail_url text;
    task_category text;
    task_tool_type text;
    user_id uuid;
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

        -- Get user_id from project for thumbnail generation
        SELECT p.user_id INTO user_id
        FROM projects p 
        WHERE p.id = NEW.project_id;

        -- Extract shot_id with comprehensive search including originalParams wrapper
        BEGIN
            -- PRIORITY 1: Check originalParams.orchestrator_details.shot_id (MOST COMMON for wan_2_2_i2v)
            IF normalized_params ? 'originalParams' AND 
               (normalized_params->'originalParams') ? 'orchestrator_details' AND
               (normalized_params->'originalParams'->'orchestrator_details') ? 'shot_id' THEN
                extracted_shot_id := (normalized_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid;
                RAISE LOG '[ProcessTask] Found shot_id in originalParams.orchestrator_details: %', extracted_shot_id;
            -- PRIORITY 2: Check direct orchestrator_details.shot_id
            ELSIF normalized_params ? 'orchestrator_details' AND
                  (normalized_params->'orchestrator_details') ? 'shot_id' THEN
                extracted_shot_id := (normalized_params->'orchestrator_details'->>'shot_id')::uuid;
                RAISE LOG '[ProcessTask] Found shot_id in orchestrator_details: %', extracted_shot_id;
            -- PRIORITY 3: Check direct shot_id field
            ELSIF normalized_params ? 'shot_id' THEN
                extracted_shot_id := (normalized_params->>'shot_id')::uuid;
                RAISE LOG '[ProcessTask] Found shot_id in params: %', extracted_shot_id;
            -- PRIORITY 4: Check shotId field (camelCase variant)
            ELSIF normalized_params ? 'shotId' THEN
                extracted_shot_id := (normalized_params->>'shotId')::uuid;
                RAISE LOG '[ProcessTask] Found shotId in params: %', extracted_shot_id;
            ELSE
                extracted_shot_id := NULL;
                RAISE LOG '[ProcessTask] No shot_id found in params for task %', NEW.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            extracted_shot_id := NULL;
            RAISE LOG '[ProcessTask] Error extracting shot_id for task %: %', NEW.id, SQLERRM;
        END;

        -- Extract add_in_position flag (default: false for unpositioned)
        BEGIN
            IF normalized_params ? 'add_in_position' THEN
                add_in_position := (normalized_params->>'add_in_position')::boolean;
            ELSIF normalized_params ? 'originalParams' AND 
                  (normalized_params->'originalParams') ? 'add_in_position' THEN
                add_in_position := (normalized_params->'originalParams'->>'add_in_position')::boolean;
            ELSE
                add_in_position := false; -- DEFAULT: unpositioned
            END IF;
            RAISE LOG '[ProcessTask] Extracted add_in_position: % for task %', add_in_position, NEW.id;
        EXCEPTION WHEN OTHERS THEN
            add_in_position := false; -- DEFAULT: unpositioned on error
            RAISE LOG '[ProcessTask] Error extracting add_in_position for task %, defaulting to false: %', NEW.id, SQLERRM;
        END;

        -- Get output location directly from the task record (set by complete_task edge function)
        output_location := NEW.output_location;
        RAISE LOG '[ProcessTask] Using output_location: %', output_location;

        -- Extract thumbnail_url from task params (if provided by client)
        BEGIN
            IF normalized_params ? 'thumbnail_url' THEN
                thumbnail_url := normalized_params->>'thumbnail_url';
                RAISE LOG '[ProcessTask] Found thumbnail_url in params: %', thumbnail_url;
            ELSIF normalized_params ? 'thumbnailUrl' THEN
                thumbnail_url := normalized_params->>'thumbnailUrl';
                RAISE LOG '[ProcessTask] Found thumbnailUrl in params: %', thumbnail_url;
            ELSIF normalized_params ? 'originalParams' AND 
                  (normalized_params->'originalParams') ? 'thumbnail_url' THEN
                thumbnail_url := normalized_params->'originalParams'->>'thumbnail_url';
                RAISE LOG '[ProcessTask] Found thumbnail_url in originalParams: %', thumbnail_url;
            ELSIF normalized_params ? 'originalParams' AND 
                  (normalized_params->'originalParams') ? 'thumbnailUrl' THEN
                thumbnail_url := normalized_params->'originalParams'->>'thumbnailUrl';
                RAISE LOG '[ProcessTask] Found thumbnailUrl in originalParams: %', thumbnail_url;
            ELSE
                thumbnail_url := NULL;
                RAISE LOG '[ProcessTask] No thumbnail_url found in params for task %', NEW.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            thumbnail_url := NULL;
            RAISE LOG '[ProcessTask] Error extracting thumbnail_url for task %: %', NEW.id, SQLERRM;
        END;

        -- Determine generation type
        IF task_tool_type = 'image-generation' THEN
            generation_type := 'image';
        ELSIF task_tool_type = 'travel-between-images' THEN
            generation_type := 'video';
        ELSE
            generation_type := 'unknown';
        END IF;

        -- Build generation params
        generation_params := normalized_params;
        
        -- Add shot_id if present and valid
        IF extracted_shot_id IS NOT NULL THEN
            generation_params := generation_params || jsonb_build_object('shotId', extracted_shot_id);
        END IF;
        
        -- Add thumbnail_url to params if available
        IF thumbnail_url IS NOT NULL THEN
            generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
            RAISE LOG '[ProcessTask] Added thumbnail_url to generation params for % task %: %', NEW.task_type, NEW.id, thumbnail_url;
        END IF;

        -- Insert the generation record with extracted thumbnail_url
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
            to_jsonb(ARRAY[NEW.id]),  -- Store as JSONB array
            generation_params,
            output_location,
            generation_type,
            NEW.project_id,
            thumbnail_url,  -- Save extracted thumbnail_url directly to column
            NOW()
        );

        -- Link generation to shot if shot_id exists and is valid
        IF extracted_shot_id IS NOT NULL THEN
            -- Use the RPC function to handle positioning based on add_in_position
            PERFORM add_generation_to_shot(extracted_shot_id, new_generation_id, add_in_position);
            
            RAISE LOG '[ProcessTask] Added generation % to shot % with add_in_position=%', 
                new_generation_id, extracted_shot_id, add_in_position;
        END IF;

        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;

        RAISE LOG '[ProcessTask] Created generation % for % task % with category: %, tool_type: %, thumbnail_url: %, add_in_position: %', 
            new_generation_id, NEW.task_type, NEW.id, task_category, task_tool_type, 
            COALESCE(thumbnail_url, 'none'),
            add_in_position;
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

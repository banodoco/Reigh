-- Fix thumbnail extraction to include orchestrator_details.thumbnail_url
-- This restores the missing logic for wan_2_2_i2v tasks that was accidentally removed

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

        -- FIXED: Extract thumbnail_url from task params with comprehensive search
        BEGIN
            -- PRIORITY 1: Check for auto-generated thumbnail from complete_task (top-level)
            IF normalized_params ? 'thumbnail_url' THEN
                thumbnail_url := normalized_params->>'thumbnail_url';
                RAISE LOG '[ProcessTask] Found thumbnail_url in params: %', thumbnail_url;
            -- PRIORITY 2: Check thumbnailUrl (camelCase variant)
            ELSIF normalized_params ? 'thumbnailUrl' THEN
                thumbnail_url := normalized_params->>'thumbnailUrl';
                RAISE LOG '[ProcessTask] Found thumbnailUrl in params: %', thumbnail_url;
            -- PRIORITY 3: Check originalParams.orchestrator_details.thumbnail_url
            ELSIF normalized_params ? 'originalParams' AND 
                  (normalized_params->'originalParams') ? 'orchestrator_details' AND
                  (normalized_params->'originalParams'->'orchestrator_details') ? 'thumbnail_url' THEN
                thumbnail_url := normalized_params->'originalParams'->'orchestrator_details'->>'thumbnail_url';
                RAISE LOG '[ProcessTask] Found thumbnail_url in originalParams.orchestrator_details: %', thumbnail_url;
            -- PRIORITY 4: Check originalParams.orchestrator_details.thumbnailUrl
            ELSIF normalized_params ? 'originalParams' AND 
                  (normalized_params->'originalParams') ? 'orchestrator_details' AND
                  (normalized_params->'originalParams'->'orchestrator_details') ? 'thumbnailUrl' THEN
                thumbnail_url := normalized_params->'originalParams'->'orchestrator_details'->>'thumbnailUrl';
                RAISE LOG '[ProcessTask] Found thumbnailUrl in originalParams.orchestrator_details: %', thumbnail_url;
            -- PRIORITY 5: Check direct orchestrator_details.thumbnail_url (THIS WAS MISSING!)
            ELSIF normalized_params ? 'orchestrator_details' AND
                  (normalized_params->'orchestrator_details') ? 'thumbnail_url' THEN
                thumbnail_url := normalized_params->'orchestrator_details'->>'thumbnail_url';
                RAISE LOG '[ProcessTask] Found thumbnail_url in orchestrator_details: %', thumbnail_url;
            -- PRIORITY 6: Check direct orchestrator_details.thumbnailUrl
            ELSIF normalized_params ? 'orchestrator_details' AND
                  (normalized_params->'orchestrator_details') ? 'thumbnailUrl' THEN
                thumbnail_url := normalized_params->'orchestrator_details'->>'thumbnailUrl';
                RAISE LOG '[ProcessTask] Found thumbnailUrl in orchestrator_details: %', thumbnail_url;
            -- PRIORITY 7: Check full_orchestrator_payload.thumbnail_url (for travel_stitch)
            ELSIF normalized_params ? 'full_orchestrator_payload' AND
                  (normalized_params->'full_orchestrator_payload') ? 'thumbnail_url' THEN
                thumbnail_url := normalized_params->'full_orchestrator_payload'->>'thumbnail_url';
                RAISE LOG '[ProcessTask] Found thumbnail_url in full_orchestrator_payload: %', thumbnail_url;
            ELSE
                thumbnail_url := NULL;
                RAISE LOG '[ProcessTask] No thumbnail_url found in params for task %', NEW.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            thumbnail_url := NULL;
            RAISE LOG '[ProcessTask] Error extracting thumbnail_url for task %: %', NEW.id, SQLERRM;
        END;

        -- Determine generation type based on tool_type from task_types table
        IF task_tool_type = 'image-generation' OR task_tool_type = 'magic-edit' THEN
            generation_type := 'image';
        ELSIF task_tool_type = 'travel-between-images' OR task_tool_type = 'edit-travel' THEN
            generation_type := 'video';
        ELSE
            generation_type := 'image'; -- Default to image for unknown tool types
        END IF;

        -- Build generation params starting with normalized task params
        generation_params := normalized_params;
        
        -- CRITICAL FIX: Add tool_type to the params JSONB (this was missing!)
        generation_params := generation_params || jsonb_build_object('tool_type', task_tool_type);
        
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

        -- CRITICAL FIX: Use UPDATE statement instead of NEW assignment (AFTER UPDATE trigger can't modify NEW)
        UPDATE tasks SET generation_created = TRUE WHERE id = NEW.id;

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

-- Log confirmation
SELECT 'Fixed generation trigger: now properly extracts thumbnails from orchestrator_details.thumbnail_url' as status;

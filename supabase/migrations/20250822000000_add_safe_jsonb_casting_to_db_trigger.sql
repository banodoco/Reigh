-- Add safe JSONB to UUID casting in create_generation_on_task_complete function
-- This restores the safe exception handling for shot_id extraction that prevents casting errors

CREATE OR REPLACE FUNCTION create_generation_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
    new_generation_id uuid;
    generation_type text;
    generation_params jsonb;
    normalized_params jsonb;
    shot_id uuid;
    output_location text;
    thumbnail_url text;
BEGIN
    -- Process ANY completed task that doesn't have a generation yet
    IF NEW.status = 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND NEW.task_type IN ('travel_stitch', 'single_image') THEN
        
        RAISE LOG '[ProcessTask] Processing completed % task %', NEW.task_type, NEW.id;
        
        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);
        
        -- Generate a new UUID for the generation
        new_generation_id := gen_random_uuid();
        
        -- Process travel_stitch tasks
        IF NEW.task_type = 'travel_stitch' THEN
            generation_type := 'video';
            
            -- SAFE: Extract shot_id from params with exception handling
            BEGIN
                shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
            EXCEPTION 
                WHEN invalid_text_representation OR data_exception THEN
                    shot_id := NULL; -- Continue without shot linking
                    RAISE LOG '[ProcessTask] Invalid shot_id format in travel_stitch task %, continuing without shot link', NEW.id;
            END;
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params.full_orchestrator_payload.thumbnail_url
            thumbnail_url := normalized_params->'full_orchestrator_payload'->>'thumbnail_url';
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for task %: shot_id=%, output_location=%, project_id=%', 
                    NEW.id, shot_id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for video
            generation_params := jsonb_build_object(
                'type', 'travel_stitch',
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', 'travel-between-images'
            );
            
            -- Add shot_id only if it's valid
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
            END IF;
            
            -- Add thumbnail_url to params if available
            IF thumbnail_url IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
                RAISE LOG '[ProcessTask] Found thumbnail_url for travel_stitch task %: %', NEW.id, thumbnail_url;
            END IF;
            
        -- Process single_image tasks
        ELSIF NEW.task_type = 'single_image' THEN
            generation_type := 'image';
            
            -- SAFE: Extract shot_id if present with exception handling
            BEGIN
                shot_id := (normalized_params->>'shot_id')::uuid;
            EXCEPTION 
                WHEN invalid_text_representation OR data_exception THEN
                    shot_id := NULL; -- Continue without shot linking
                    RAISE LOG '[ProcessTask] Invalid shot_id format in single_image task %, continuing without shot link', NEW.id;
            END;
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params.shot_id.thumbnail_url (if shot_id is object) 
            -- or params.thumbnail_url as fallback
            thumbnail_url := COALESCE(
                normalized_params->'shot_id'->>'thumbnail_url',
                normalized_params->>'thumbnail_url'
            );
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for task %: output_location=%, project_id=%', 
                    NEW.id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for image
            generation_params := jsonb_build_object(
                'type', 'single_image',
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', 'image-generation'
            );
            
            -- Add shot_id if present and valid
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
            END IF;
            
            -- Add thumbnail_url to params if available
            IF thumbnail_url IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
                RAISE LOG '[ProcessTask] Found thumbnail_url for single_image task %: %', NEW.id, thumbnail_url;
            END IF;
        END IF;
        
        -- Insert the generation record with thumbnail_url
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
            thumbnail_url,
            NOW()
        );
        
        -- Link generation to shot if shot_id exists and is valid
        IF shot_id IS NOT NULL THEN
            -- Use the RPC function to handle positioning
            PERFORM add_generation_to_shot(shot_id, new_generation_id, true);
        END IF;
        
        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;
        
        RAISE LOG '[ProcessTask] Created generation % for task % with thumbnail_url: %', 
            new_generation_id, NEW.id, COALESCE(thumbnail_url, 'none');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Confirm the fix was applied
SELECT 'Added safe JSONB to UUID casting in create_generation_on_task_complete function' as status;

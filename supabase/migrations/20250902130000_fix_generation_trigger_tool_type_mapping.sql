-- Fix generation trigger to use task_types.category for tool_type mapping
-- Instead of hardcoded pattern matching, use the category from task_types table

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
    task_category text;
    task_run_type text;
    tool_type text;
BEGIN
    -- Get task metadata from task_types table
    SELECT category, run_type INTO task_category, task_run_type
    FROM task_types 
    WHERE name = NEW.task_type AND is_active = true;
    
    -- Process ANY completed task that doesn't have a generation yet AND has category = 'generation'
    IF NEW.status = 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND task_category = 'generation' THEN
        
        RAISE LOG '[ProcessTask] Processing completed generation task % (type: %, category: %)', NEW.id, NEW.task_type, task_category;
        
        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);
        
        -- Generate a new UUID for the generation
        new_generation_id := gen_random_uuid();
        
        -- Determine tool_type based on category from task_types table
        -- This makes it fully category-driven instead of hardcoded patterns
        tool_type := CASE 
            -- Special cases that need specific tool_type mapping
            WHEN NEW.task_type = 'travel_stitch' THEN 'travel-between-images'
            WHEN NEW.task_type LIKE '%edit_travel%' THEN 'edit-travel'
            WHEN NEW.task_type LIKE '%edit%' OR NEW.task_type = 'magic_edit' THEN 'magic-edit'
            
            -- For generation category, default to image-generation
            -- This covers: single_image, wan_2_2_t2i, qwen_image_style, etc.
            WHEN task_category = 'generation' THEN 'image-generation'
            
            -- Fallback (shouldn't happen since we filter by category = 'generation')
            ELSE 'unknown'
        END;
        
        -- Process travel_stitch tasks (special case - creates video)
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
                'tool_type', tool_type
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
            
        -- All other generation task types create image generations
        ELSE
            generation_type := 'image';
            
            -- SAFE: Extract shot_id if present with exception handling
            BEGIN
                shot_id := (normalized_params->>'shot_id')::uuid;
            EXCEPTION 
                WHEN invalid_text_representation OR data_exception THEN
                    shot_id := NULL; -- Continue without shot linking
                    RAISE LOG '[ProcessTask] Invalid shot_id format in % task %, continuing without shot link', NEW.task_type, NEW.id;
            END;
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params if available
            thumbnail_url := normalized_params->>'thumbnail_url';
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for % task %: output_location=%, project_id=%',
                    NEW.task_type, NEW.id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for image generation tasks
            generation_params := jsonb_build_object(
                'type', NEW.task_type,
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', tool_type
            );
            
            -- Add shot_id if present and valid
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
            END IF;
            
            -- Add thumbnail_url to params if available
            IF thumbnail_url IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
                RAISE LOG '[ProcessTask] Found thumbnail_url for % task %: %', NEW.task_type, NEW.id, thumbnail_url;
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
        
        RAISE LOG '[ProcessTask] Created generation % for % task % with category: %, tool_type: %, thumbnail_url: %', 
            new_generation_id, NEW.task_type, NEW.id, task_category, tool_type, COALESCE(thumbnail_url, 'none');
    ELSE
        -- Log why task was skipped for debugging
        IF NEW.status = 'Complete'::task_status AND NEW.generation_created = FALSE THEN
            RAISE LOG '[ProcessTask] Skipping task % (type: %) - not a generation task (category: %)', 
                NEW.id, NEW.task_type, COALESCE(task_category, 'unknown');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log confirmation
SELECT 'Fixed generation trigger to properly use task_types.category for processing decisions' as status;

-- Update generation trigger to:
-- 1. Search orchestrator_details first, then fall back to other locations for shot_id
-- 2. Add support for add_in_position parameter to control positioning behavior

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
    add_in_position boolean := false; -- Default to false (current behavior)
BEGIN
    -- First check if this task type has category = 'generation'
    SELECT category INTO task_category 
    FROM task_types 
    WHERE name = NEW.task_type AND is_active = true;
    
    -- Process ANY completed task that doesn't have a generation yet AND has category = 'generation'
    IF NEW.status = 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND task_category = 'generation' THEN
        
        RAISE LOG '[ProcessTask] Processing completed generation task % (type: %)', NEW.id, NEW.task_type;
        
        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);
        
        -- Generate a new UUID for the generation
        new_generation_id := gen_random_uuid();
        
        -- ENHANCED: Extract shot_id with improved search order and add_in_position logic
        BEGIN
            -- First priority: Check orchestrator_details.shot_id
            shot_id := (normalized_params->'orchestrator_details'->>'shot_id')::uuid;
            
            -- Also check for add_in_position in orchestrator_details
            IF (normalized_params->'orchestrator_details'->>'add_in_position')::boolean IS NOT NULL THEN
                add_in_position := (normalized_params->'orchestrator_details'->>'add_in_position')::boolean;
            END IF;
            
            -- If not found in orchestrator_details, try other locations based on task type
            IF shot_id IS NULL THEN
                IF NEW.task_type = 'travel_stitch' THEN
                    -- For travel_stitch, try full_orchestrator_payload as fallback
                    shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
                    
                    -- Check for add_in_position in full_orchestrator_payload
                    IF add_in_position = false AND (normalized_params->'full_orchestrator_payload'->>'add_in_position')::boolean IS NOT NULL THEN
                        add_in_position := (normalized_params->'full_orchestrator_payload'->>'add_in_position')::boolean;
                    END IF;
                ELSE
                    -- For other tasks, try top-level shot_id
                    shot_id := (normalized_params->>'shot_id')::uuid;
                    
                    -- Check for add_in_position at top level
                    IF add_in_position = false AND (normalized_params->>'add_in_position')::boolean IS NOT NULL THEN
                        add_in_position := (normalized_params->>'add_in_position')::boolean;
                    END IF;
                END IF;
            END IF;
            
            RAISE LOG '[ProcessTask] Extracted shot_id: %, add_in_position: % for task %', shot_id, add_in_position, NEW.id;
            
        EXCEPTION 
            WHEN invalid_text_representation OR data_exception THEN
                shot_id := NULL; -- Continue without shot linking
                add_in_position := false; -- Reset to default
                RAISE LOG '[ProcessTask] Invalid shot_id format in % task %, continuing without shot link', NEW.task_type, NEW.id;
        END;
        
        -- Process travel_stitch tasks (special case - creates video)
        IF NEW.task_type = 'travel_stitch' THEN
            generation_type := 'video';
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params - check orchestrator_details first, then full_orchestrator_payload
            thumbnail_url := normalized_params->'orchestrator_details'->>'thumbnail_url';
            IF thumbnail_url IS NULL THEN
                thumbnail_url := normalized_params->'full_orchestrator_payload'->>'thumbnail_url';
            END IF;
            
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
            
        -- All other generation task types create image generations
        ELSE
            generation_type := 'image';
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params - check orchestrator_details first, then top-level
            thumbnail_url := normalized_params->'orchestrator_details'->>'thumbnail_url';
            IF thumbnail_url IS NULL THEN
                thumbnail_url := normalized_params->>'thumbnail_url';
            END IF;
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for % task %: output_location=%, project_id=%', 
                    NEW.task_type, NEW.id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for image generation tasks
            -- Map task types to appropriate tool types
            generation_params := jsonb_build_object(
                'type', NEW.task_type,
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', CASE 
                    WHEN NEW.task_type = 'single_image' THEN 'image-generation'
                    WHEN NEW.task_type IN ('image_edit', 'qwen_image_edit', 'magic_edit') THEN 'magic-edit'
                    WHEN NEW.task_type LIKE '%edit_travel%' THEN 'edit-travel'
                    ELSE 'unknown'
                END
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
            -- Use the RPC function with positioning based on add_in_position parameter
            IF add_in_position THEN
                RAISE LOG '[ProcessTask] Adding generation % to shot % WITH position (add_in_position=true)', new_generation_id, shot_id;
                PERFORM add_generation_to_shot(shot_id, new_generation_id, true);
            ELSE
                RAISE LOG '[ProcessTask] Adding generation % to shot % WITHOUT position (add_in_position=false)', new_generation_id, shot_id;
                PERFORM add_generation_to_shot(shot_id, new_generation_id, false);
            END IF;
        END IF;
        
        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;
        
        RAISE LOG '[ProcessTask] Created generation % for % task % with thumbnail_url: %, add_in_position: %', 
            new_generation_id, NEW.task_type, NEW.id, COALESCE(thumbnail_url, 'none'), add_in_position;
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

-- Process any existing completed generation tasks that haven't created generations yet
UPDATE tasks 
SET updated_at = NOW()
WHERE status = 'Complete'::task_status 
    AND generation_created = FALSE
    AND task_type IN (
        SELECT name 
        FROM task_types 
        WHERE category = 'generation' 
        AND is_active = true
    );

-- Confirm the migration was applied
SELECT 'Updated create_generation_on_task_complete function with enhanced shot_id extraction and add_in_position support' as status;

-- Fix generation trigger to use task_types.tool_type instead of hardcoded CASE statement
-- This ensures that all task types with category='generation' get the correct tool_type from the database

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
    task_tool_type text;
    add_in_position boolean := false; -- Default to false (current behavior)
BEGIN
    -- Get task metadata from task_types table including the new tool_type column
    SELECT category, tool_type INTO task_category, task_tool_type
    FROM task_types
    WHERE name = NEW.task_type AND is_active = true;

    -- Process ANY completed task that doesn't have a generation yet AND has category = 'generation'
    IF NEW.status = 'Complete'::task_status
       AND NEW.generation_created = FALSE
       AND task_category = 'generation' THEN

        RAISE LOG '[ProcessTask] Processing completed generation task % (type: %, tool_type: %)', NEW.id, NEW.task_type, task_tool_type;

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
                    -- For other task types, try top-level shot_id
                    shot_id := (normalized_params->>'shot_id')::uuid;
                    
                    -- Check for add_in_position at top level
                    IF add_in_position = false AND (normalized_params->>'add_in_position')::boolean IS NOT NULL THEN
                        add_in_position := (normalized_params->>'add_in_position')::boolean;
                    END IF;
                END IF;
            END IF;
        EXCEPTION 
            WHEN invalid_text_representation OR data_exception THEN
                shot_id := NULL; -- Continue without shot linking
                RAISE LOG '[ProcessTask] Invalid shot_id format in % task %, continuing without shot link', NEW.task_type, NEW.id;
        END;

        -- Handle travel_stitch tasks specially (they create video generations)
        IF NEW.task_type = 'travel_stitch' THEN
            generation_type := 'video';
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params - check orchestrator_details first, then top-level
            thumbnail_url := COALESCE(
                normalized_params->'orchestrator_details'->>'thumbnail_url',
                normalized_params->>'thumbnail_url'
            );
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for travel_stitch task %: output_location=%, project_id=%',
                    NEW.id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            generation_params := jsonb_build_object(
                'type', 'travel_stitch',
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', COALESCE(task_tool_type, 'travel-between-images')
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
            -- ✅ CLEAN: Use tool_type directly from task_types table
            generation_params := jsonb_build_object(
                'type', NEW.task_type,
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', COALESCE(task_tool_type, 'image-generation')
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
            created_at,
            project_id,
            thumbnail_url
        ) VALUES (
            new_generation_id,
            jsonb_build_array(NEW.id),
            generation_params,
            output_location,
            generation_type,
            NOW(),
            NEW.project_id,
            thumbnail_url
        );

        -- Create shot_generations link if shot_id is present and add_in_position is true
        IF shot_id IS NOT NULL AND add_in_position = true THEN
            -- Get the current max position for this shot, handling NULL case
            DECLARE
                next_position integer;
            BEGIN
                SELECT COALESCE(MAX(position), 0) + 1 INTO next_position
                FROM shot_generations
                WHERE shot_id = shot_id;

                INSERT INTO shot_generations (shot_id, generation_id, position)
                VALUES (shot_id, new_generation_id, next_position);

                RAISE LOG '[ProcessTask] Linked generation % to shot % at position %', new_generation_id, shot_id, next_position;
            EXCEPTION WHEN OTHERS THEN
                RAISE LOG '[ProcessTask] Failed to create shot_generations link for generation % and shot %: %', new_generation_id, shot_id, SQLERRM;
            END;
        ELSIF shot_id IS NOT NULL THEN
            -- Create shot_generations link without position (add_in_position = false)
            BEGIN
                INSERT INTO shot_generations (shot_id, generation_id, position)
                VALUES (shot_id, new_generation_id, NULL);

                RAISE LOG '[ProcessTask] Linked generation % to shot % without position', new_generation_id, shot_id;
            EXCEPTION WHEN OTHERS THEN
                RAISE LOG '[ProcessTask] Failed to create shot_generations link for generation % and shot %: %', new_generation_id, shot_id, SQLERRM;
            END;
        END IF;

        -- Mark the task as having had its generation created
        UPDATE tasks SET generation_created = TRUE WHERE id = NEW.id;
        
        RAISE LOG '[ProcessTask] Created % generation % for task % (shot_id: %, add_in_position: %)', 
                  generation_type, new_generation_id, NEW.id, shot_id, add_in_position;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

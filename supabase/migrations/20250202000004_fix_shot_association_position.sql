-- Fix shot association to create records with NULL position initially
-- This allows shot-associated generations to be displayed in the "unpositioned" filter

CREATE OR REPLACE FUNCTION create_generation_on_task_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_generation_id uuid;
    generation_type text;
    generation_params jsonb;
    normalized_params jsonb;
    shot_id uuid := NULL; -- Default to NULL
    output_location text;
BEGIN
    -- Process completed tasks that need generations
    IF NEW.status = 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND NEW.task_type IN ('travel_stitch', 'single_image') THEN
        
        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);
        new_generation_id := gen_random_uuid();
        
        -- SAFE: Try to extract shot_id, continue if it fails
        BEGIN
            IF NEW.task_type = 'travel_stitch' THEN
                shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
            ELSE -- single_image
                shot_id := (normalized_params->>'shot_id')::uuid;
            END IF;
        EXCEPTION 
            WHEN invalid_text_representation OR data_exception THEN
                shot_id := NULL; -- Continue without shot linking
        END;
        
        -- Validate required fields
        IF NEW.output_location IS NULL OR NEW.project_id IS NULL THEN
            RETURN NEW; -- Skip generation if missing critical data
        END IF;
        
        -- Build generation params based on task type
        IF NEW.task_type = 'travel_stitch' THEN
            generation_type := 'video';
            output_location := NEW.output_location;
            
            -- Validate required fields
            IF output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for task %: output_location=%, project_id=%', 
                    NEW.id, output_location, NEW.project_id;
                RETURN NEW;
            END IF;
            
            -- Build generation params for video
            generation_params := jsonb_build_object(
                'type', 'travel_stitch',
                'shotId', shot_id,
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', 'travel-between-images'
            );
            
        -- Process single_image tasks
        ELSIF NEW.task_type = 'single_image' THEN
            generation_type := 'image';
            
            -- Extract shot_id if present
            shot_id := (normalized_params->>'shot_id')::uuid;
            output_location := NEW.output_location;
            
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
            
            -- Add shot_id if present
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
            END IF;
        END IF;
        
        -- Insert the generation record
        INSERT INTO generations (
            id,
            tasks,
            params,
            location,
            type,
            project_id,
            created_at
        ) VALUES (
            new_generation_id,
            to_jsonb(ARRAY[NEW.id]),  -- Store as JSONB array
            generation_params,
            output_location,
            generation_type,
            NEW.project_id,
            NOW()
        );
        
        -- Link generation to shot if shot_id exists
        -- Use FALSE to create with NULL position initially
        IF shot_id IS NOT NULL THEN
            -- Use the RPC function with NULL position initially
            PERFORM add_generation_to_shot(shot_id, new_generation_id, false);
        END IF;
        
        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;
    END IF;
    
    RETURN NEW;
END;
$$; 
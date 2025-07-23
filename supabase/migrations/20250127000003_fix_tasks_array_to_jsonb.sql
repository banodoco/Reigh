-- Fix the trigger function to properly store tasks as JSONB instead of ARRAY

-- Update the function to convert ARRAY to JSONB
CREATE OR REPLACE FUNCTION create_generation_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
    new_generation_id uuid;
    generation_type text;
    generation_params jsonb;
    normalized_params jsonb;
    shot_id uuid;
    output_location text;
BEGIN
    -- Process ANY completed task that doesn't have a generation yet
    IF NEW.status = 'Complete' 
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
            
            -- Extract shot_id from params
            shot_id := (normalized_params->'full_orchestrator_payload'->'shot_id')::uuid;
            output_location := NEW.output_location;
            
            -- Validate required fields
            IF shot_id IS NULL OR output_location IS NULL OR NEW.project_id IS NULL THEN
                RAISE LOG '[ProcessTask] Missing critical data for task %: shot_id=%, output_location=%, project_id=%', 
                    NEW.id, shot_id, output_location, NEW.project_id;
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
            
            -- Determine output location with fallbacks
            output_location := COALESCE(
                NEW.output_location,
                NEW.params->>'output_location',
                NEW.params->>'outputLocation',
                NEW.params->>'image_url',
                NEW.params->>'imageUrl'
            );
            
            IF output_location IS NULL THEN
                RAISE LOG '[ProcessTask] No output location found for task %', NEW.id;
                RETURN NEW;
            END IF;
            
            -- Extract shot_id if present
            shot_id := (NEW.params->>'shot_id')::uuid;
            
            -- Build generation params for image
            generation_params := jsonb_build_object(
                'prompt', COALESCE(NEW.params->'orchestrator_details'->>'prompt', ''),
                'seed', NEW.params->'orchestrator_details'->'seed',
                'model', NEW.params->'orchestrator_details'->'model',
                'resolution', NEW.params->'orchestrator_details'->'resolution',
                'source', 'wan_single_image_task',
                'tool_type', 'image-generation'
            );
        END IF;
        
        -- Create the generation record
        BEGIN
            INSERT INTO generations (
                id,
                tasks,
                params,
                location,
                type,
                project_id,
                created_at,
                updated_at
            ) VALUES (
                new_generation_id,
                to_jsonb(ARRAY[NEW.id]),  -- Convert ARRAY to JSONB
                generation_params,
                output_location,
                generation_type,
                NEW.project_id,
                NOW(),
                NOW()
            );
            
            RAISE LOG '[ProcessTask] Created generation % for task %', new_generation_id, NEW.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE LOG '[ProcessTask] Error inserting generation for task %: %', NEW.id, SQLERRM;
            RETURN NEW;
        END;
        
        -- Create shot_generation link if applicable
        IF shot_id IS NOT NULL THEN
            BEGIN
                IF NEW.task_type = 'travel_stitch' THEN
                    -- Travel stitch uses position 0
                    INSERT INTO shot_generations (
                        shot_id,
                        generation_id,
                        position
                    ) VALUES (
                        shot_id,
                        new_generation_id,
                        0
                    );
                ELSE
                    -- Single images use NULL position
                    INSERT INTO shot_generations (
                        shot_id,
                        generation_id,
                        position
                    ) VALUES (
                        shot_id,
                        new_generation_id,
                        NULL
                    );
                END IF;
                
                RAISE LOG '[ProcessTask] Created shot_generation link for shot %', shot_id;
            EXCEPTION WHEN OTHERS THEN
                -- Don't fail the whole transaction if shot link fails
                RAISE LOG '[ProcessTask] Error creating shot_generation for task %: %', NEW.id, SQLERRM;
            END;
        END IF;
        
        -- Update the task params with normalized paths
        NEW.params := normalized_params;
        
        -- Mark the task as having created a generation
        NEW.generation_created := true;
        
        RAISE LOG '[ProcessTask] Successfully processed task %, created generation %', NEW.id, new_generation_id;
        
        -- The existing broadcast_task_status_update trigger will handle real-time updates
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now retry processing all existing completed tasks
UPDATE tasks 
SET updated_at = NOW()
WHERE status = 'Complete' 
    AND generation_created = FALSE
    AND task_type IN ('travel_stitch', 'single_image'); 
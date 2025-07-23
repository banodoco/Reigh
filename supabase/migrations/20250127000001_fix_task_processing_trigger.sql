-- Fix task processing by moving generation creation directly into the database
-- This eliminates the need for HTTP calls from triggers and the Edge Function entirely

-- Drop the existing trigger and function that tries to make HTTP calls
DROP TRIGGER IF EXISTS trigger_process_completed_tasks ON tasks;
DROP FUNCTION IF EXISTS process_completed_task_trigger();

-- Create a function to normalize image paths (removing server IP addresses)
CREATE OR REPLACE FUNCTION normalize_image_path(image_path text)
RETURNS text AS $$
BEGIN
    -- Remove local server IP patterns (e.g., http://192.168.1.1:3000/files/...)
    -- Pattern: http(s)://[IP]:[PORT]/... -> just the path part
    IF image_path ~ '^https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:[0-9]+/' THEN
        -- Extract just the path part after the host
        RETURN regexp_replace(image_path, '^https?://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:[0-9]+/', '');
    END IF;
    
    RETURN image_path;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to recursively normalize image paths in JSONB
CREATE OR REPLACE FUNCTION normalize_image_paths_in_jsonb(data jsonb)
RETURNS jsonb AS $$
DECLARE
    key text;
    value jsonb;
    result jsonb;
BEGIN
    IF jsonb_typeof(data) = 'string' THEN
        -- Check if it looks like an image path
        IF data::text ~ '\.(png|jpg|jpeg|gif|webp|svg)$' OR data::text LIKE '%/files/%' THEN
            RETURN to_jsonb(normalize_image_path(data::text));
        END IF;
        RETURN data;
    ELSIF jsonb_typeof(data) = 'array' THEN
        result := '[]'::jsonb;
        FOR value IN SELECT jsonb_array_elements(data)
        LOOP
            result := result || normalize_image_paths_in_jsonb(value);
        END LOOP;
        RETURN result;
    ELSIF jsonb_typeof(data) = 'object' THEN
        result := '{}'::jsonb;
        FOR key, value IN SELECT * FROM jsonb_each(data)
        LOOP
            result := jsonb_set(result, ARRAY[key], normalize_image_paths_in_jsonb(value));
        END LOOP;
        RETURN result;
    ELSE
        RETURN data;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function that directly creates generations when tasks complete
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
    -- Only process tasks that just became 'Complete' and haven't created generations yet
    IF NEW.status = 'Complete' 
       AND OLD.status != 'Complete' 
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
                ARRAY[NEW.id],
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

-- Create the new trigger (BEFORE UPDATE to modify NEW values)
CREATE TRIGGER trigger_create_generation_on_task_complete
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION create_generation_on_task_complete();

-- Add indexes to improve performance
CREATE INDEX IF NOT EXISTS idx_tasks_status_generation_created 
    ON tasks(status, generation_created) 
    WHERE status = 'Complete' AND generation_created = false;

CREATE INDEX IF NOT EXISTS idx_tasks_task_type 
    ON tasks(task_type) 
    WHERE task_type IN ('travel_stitch', 'single_image');

-- Add comment explaining the approach
COMMENT ON FUNCTION create_generation_on_task_complete() IS 
'Creates generation records directly in the database when tasks complete, replacing the process-completed-task Edge Function';

COMMENT ON FUNCTION normalize_image_path(text) IS 
'Normalizes image paths by removing local server IP addresses';

COMMENT ON FUNCTION normalize_image_paths_in_jsonb(jsonb) IS 
'Recursively normalizes all image paths found in JSONB data'; 
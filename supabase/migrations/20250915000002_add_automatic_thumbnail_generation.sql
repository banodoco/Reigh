-- Add automatic thumbnail generation to the task completion trigger
-- This will call the generate-thumbnail edge function when new generations are created

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

        -- FIXED: Extract shot_id with comprehensive search including originalParams wrapper
        BEGIN
            -- PRIORITY 1: Check originalParams.orchestrator_details.shot_id (MOST COMMON for wan_2_2_i2v)
            extracted_shot_id := (normalized_params->'originalParams'->'orchestrator_details'->>'shot_id')::uuid;
            
            -- Also check for add_in_position in originalParams.orchestrator_details
            IF (normalized_params->'originalParams'->'orchestrator_details'->>'add_in_position')::boolean IS NOT NULL THEN
                add_in_position := (normalized_params->'originalParams'->'orchestrator_details'->>'add_in_position')::boolean;
            END IF;

            -- PRIORITY 2: If not found, check orchestrator_details.shot_id (direct)
            IF extracted_shot_id IS NULL THEN
                extracted_shot_id := (normalized_params->'orchestrator_details'->>'shot_id')::uuid;
                
                -- Check for add_in_position in orchestrator_details
                IF (normalized_params->'orchestrator_details'->>'add_in_position')::boolean IS NOT NULL THEN
                    add_in_position := (normalized_params->'orchestrator_details'->>'add_in_position')::boolean;
                END IF;
            END IF;

            -- PRIORITY 3: If still not found, try other locations based on task type
            IF extracted_shot_id IS NULL THEN
                IF task_tool_type = 'travel-between-images' THEN
                    -- For travel-between-images, try full_orchestrator_payload as fallback
                    extracted_shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
                ELSE -- For other generation task types (e.g., image-generation, magic-edit)
                    -- Try top-level shot_id
                    extracted_shot_id := (normalized_params->>'shot_id')::uuid;
                    
                    -- FIXED: Also check for add_in_position at top level (for magic-edit tasks)
                    IF (normalized_params->>'add_in_position')::boolean IS NOT NULL THEN
                        add_in_position := (normalized_params->>'add_in_position')::boolean;
                    END IF;
                END IF;
            END IF;
        EXCEPTION
            WHEN invalid_text_representation OR data_exception THEN
                extracted_shot_id := NULL;
                RAISE LOG '[ProcessTask] Invalid shot_id format in % task %, continuing without shot link', NEW.task_type, NEW.id;
        END;

        -- Determine generation type based on task tool_type from database
        CASE task_tool_type
            WHEN 'travel-between-images' THEN generation_type := 'video';
            WHEN 'image-generation' THEN generation_type := 'image';
            WHEN 'magic-edit' THEN generation_type := 'image';
            ELSE generation_type := 'unknown';
        END CASE;

        -- Extract thumbnail_url from params (prioritize originalParams.orchestrator_details)
        BEGIN
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

        output_location := NEW.output_location;

        -- Validate required fields
        IF output_location IS NULL OR NEW.project_id IS NULL THEN
            RAISE LOG '[ProcessTask] Missing critical data for task %: output_location=%, project_id=%', 
                NEW.id, output_location, NEW.project_id;
            RETURN NEW;
        END IF;

        -- Build generation params
        generation_params := jsonb_build_object(
            'type', generation_type,
            'projectId', NEW.project_id,
            'outputLocation', output_location,
            'originalParams', normalized_params,
            'tool_type', task_tool_type
        );
        
        -- Add shot_id if present and valid
        IF extracted_shot_id IS NOT NULL THEN
            generation_params := generation_params || jsonb_build_object('shotId', extracted_shot_id);
        END IF;
        
        -- Add thumbnail_url to params if available
        IF thumbnail_url IS NOT NULL THEN
            generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
            RAISE LOG '[ProcessTask] Found thumbnail_url for % task %: %', NEW.task_type, NEW.id, thumbnail_url;
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
        IF extracted_shot_id IS NOT NULL THEN
            -- Use the RPC function to handle positioning based on add_in_position
            PERFORM add_generation_to_shot(extracted_shot_id, new_generation_id, add_in_position);
            
            RAISE LOG '[ProcessTask] Added generation % to shot % with add_in_position=%', 
                new_generation_id, extracted_shot_id, add_in_position;
        END IF;

        -- AUTOMATIC THUMBNAIL GENERATION: Call edge function for image generations
        IF generation_type = 'image' AND output_location IS NOT NULL AND user_id IS NOT NULL THEN
            -- Only generate thumbnails if we don't already have one
            IF thumbnail_url IS NULL THEN
                BEGIN
                    -- Call the generate-thumbnail edge function asynchronously
                    -- Note: In production, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
                    PERFORM net.http_post(
                        url := COALESCE(
                            current_setting('app.supabase_url', true),
                            'http://localhost:54321'
                        ) || '/functions/v1/generate-thumbnail',
                        headers := jsonb_build_object(
                            'Authorization', 'Bearer ' || COALESCE(
                                current_setting('app.service_role_key', true),
                                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
                            ),
                            'Content-Type', 'application/json'
                        ),
                        body := jsonb_build_object(
                            'generation_id', new_generation_id,
                            'main_image_url', output_location,
                            'user_id', user_id
                        )::text
                    );
                    
                    RAISE LOG '[ProcessTask] Triggered automatic thumbnail generation for generation %', new_generation_id;
                EXCEPTION WHEN OTHERS THEN
                    -- FALLBACK: If thumbnail generation trigger fails, store main URL as thumbnail
                    BEGIN
                        UPDATE generations 
                        SET thumbnail_url = output_location
                        WHERE id = new_generation_id;
                        
                        RAISE LOG '[ProcessTask] Thumbnail generation failed for %, stored main URL as thumbnail fallback: %', new_generation_id, output_location;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE LOG '[ProcessTask] Failed to store fallback thumbnail for generation %: %', new_generation_id, SQLERRM;
                    END;
                END;
        END IF;

        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;

        RAISE LOG '[ProcessTask] Created generation % for % task % with category: %, tool_type: %, thumbnail_url: %, add_in_position: %', 
            new_generation_id, NEW.task_type, NEW.id, task_category, task_tool_type, COALESCE(thumbnail_url, 'none'), add_in_position;
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

-- Enable the http extension if not already enabled (for calling edge functions)
CREATE EXTENSION IF NOT EXISTS http;

-- Log confirmation
SELECT 'Added automatic thumbnail generation to task completion trigger' as status;

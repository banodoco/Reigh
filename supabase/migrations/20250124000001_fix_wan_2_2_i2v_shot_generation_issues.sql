-- Fix wan_2_2_i2v shot_generation issues
-- 1. Ensure wan_2_2_i2v task type exists with correct category and tool_type
-- 2. Fix shot_id extraction to work with both full_orchestrator_payload and orchestrator_details
-- 3. Ensure wan_2_2_i2v creates video generations, not image generations

-- First, ensure wan_2_2_i2v task type exists with correct configuration
INSERT INTO task_types (
  name,
  run_type,
  category,
  tool_type,
  display_name,
  description,
  base_cost_per_second,
  cost_factors,
  is_active
) VALUES (
  'wan_2_2_i2v',
  'gpu',
  'generation',
  'travel-between-images',
  'WAN 2.2 Image to Video',
  'Image to video generation using WAN 2.2 model',
  0.01,
  '{}',
  true
) ON CONFLICT (name) DO UPDATE SET
  category = 'generation',
  tool_type = 'travel-between-images',
  is_active = true;

-- Update the generation trigger to properly handle wan_2_2_i2v shot_id extraction
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
BEGIN
    -- Get task metadata from task_types table including the new tool_type column
    SELECT category, tool_type INTO task_category, task_tool_type
    FROM task_types 
    WHERE name = NEW.task_type AND is_active = true;
    
    -- Process ANY completed task that doesn't have a generation yet AND has category = 'generation'
    IF NEW.status = 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND task_category = 'generation' THEN
        
        RAISE LOG '[ProcessTask] Processing completed generation task % (type: %, category: %, tool_type: %)', 
            NEW.id, NEW.task_type, task_category, task_tool_type;
        
        -- Normalize image paths in params
        normalized_params := normalize_image_paths_in_jsonb(NEW.params);
        
        -- Generate a new UUID for the generation
        new_generation_id := gen_random_uuid();
        
        -- Determine generation type based on task type
        -- ✅ FIXED: Include wan_2_2_i2v as a video generation task alongside travel_stitch
        IF NEW.task_type IN ('travel_stitch', 'wan_2_2_i2v') THEN
            generation_type := 'video';
            
            -- SAFE: Extract shot_id from params with exception handling
            -- ✅ FIXED: Check both possible locations for shot_id
            BEGIN
                IF NEW.task_type = 'wan_2_2_i2v' THEN
                    -- For wan_2_2_i2v, try orchestrator_details.shot_id first (most common)
                    shot_id := (normalized_params->'orchestrator_details'->>'shot_id')::uuid;
                    
                    -- If not found, try full_orchestrator_payload.shot_id as fallback
                    IF shot_id IS NULL THEN
                        shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
                    END IF;
                ELSE
                    -- For travel_stitch, shot_id is in full_orchestrator_payload
                    shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
                END IF;
            EXCEPTION 
                WHEN invalid_text_representation OR data_exception THEN
                    shot_id := NULL; -- Continue without shot linking
                    RAISE LOG '[ProcessTask] Invalid shot_id format in % task %, continuing without shot link', NEW.task_type, NEW.id;
            END;
            
            output_location := NEW.output_location;
            
            -- Extract thumbnail_url from params based on task type
            IF NEW.task_type = 'wan_2_2_i2v' THEN
                -- For wan_2_2_i2v, check if thumbnail_url is in orchestrator_details
                thumbnail_url := normalized_params->'orchestrator_details'->>'thumbnail_url';
            ELSE
                -- For travel_stitch, thumbnail_url is in full_orchestrator_payload
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
                'type', NEW.task_type,
                'projectId', NEW.project_id,
                'outputLocation', output_location,
                'originalParams', normalized_params,
                'tool_type', COALESCE(task_tool_type, 'travel-between-images')
            );
            
            -- Add shot_id only if it's valid
            IF shot_id IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('shotId', shot_id);
                RAISE LOG '[ProcessTask] Found shot_id for % task %: %', NEW.task_type, NEW.id, shot_id;
            ELSE
                RAISE LOG '[ProcessTask] No shot_id found for % task %', NEW.task_type, NEW.id;
            END IF;
            
            -- Add thumbnail_url to params if available
            IF thumbnail_url IS NOT NULL THEN
                generation_params := generation_params || jsonb_build_object('thumbnailUrl', thumbnail_url);
                RAISE LOG '[ProcessTask] Found thumbnail_url for % task %: %', NEW.task_type, NEW.id, thumbnail_url;
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
            RAISE LOG '[ProcessTask] Created shot_generation link for shot % and generation %', shot_id, new_generation_id;
        ELSE
            RAISE LOG '[ProcessTask] No shot_generation link created - shot_id is NULL for task %', NEW.id;
        END IF;
        
        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;
        
        RAISE LOG '[ProcessTask] Created generation % for % task % with category: %, tool_type: %, type: %, shot_id: %, thumbnail_url: %', 
            new_generation_id, NEW.task_type, NEW.id, task_category, task_tool_type, generation_type, 
            COALESCE(shot_id::text, 'none'), COALESCE(thumbnail_url, 'none');
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

-- Process any existing completed wan_2_2_i2v tasks that haven't created generations yet
UPDATE tasks 
SET updated_at = NOW()
WHERE status = 'Complete' 
    AND generation_created = FALSE
    AND task_type = 'wan_2_2_i2v';

-- Verify the task type configuration
SELECT 
    name,
    category,
    tool_type,
    is_active
FROM task_types 
WHERE name = 'wan_2_2_i2v';

-- Log completion
SELECT 'Fixed wan_2_2_i2v shot_generation issues - added flexible shot_id extraction and ensured proper video generation type' as status;


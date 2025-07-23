-- ============================================================================
-- COMPLETE ENUM CASTING FIXES
-- ============================================================================
-- This migration fixes all remaining places where task_status enum casting
-- is missing, including triggers, views, and any remaining functions.
-- ============================================================================

-- ============================================================================
-- 1. FIX TRIGGER FUNCTIONS TO USE ENUM CASTING
-- ============================================================================

-- Fix process_completed_task_trigger
CREATE OR REPLACE FUNCTION process_completed_task_trigger()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    edge_function_url text;
    response_status int;
BEGIN
    -- Only process tasks that just became 'Complete' and need generation processing
    IF NEW.status = 'Complete'::task_status 
       AND OLD.status != 'Complete'::task_status 
       AND NEW.generation_created = FALSE
       AND NEW.generation_processed_at IS NOT NULL
       AND NEW.task_type IN ('travel_stitch', 'single_image') THEN
        
        -- Get Supabase configuration from environment
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        -- Skip if configuration is not available (prevents errors in development)
        IF supabase_url IS NULL OR service_role_key IS NULL THEN
            RAISE LOG 'Supabase configuration not available for task processing trigger';
            RETURN NEW;
        END IF;
        
        -- Construct Edge Function URL
        edge_function_url := supabase_url || '/functions/v1/process-completed-task';
        
        -- Call the Edge Function asynchronously
        -- Note: Using http extension for non-blocking call
        BEGIN
            SELECT status INTO response_status
            FROM http_post(
                edge_function_url,
                jsonb_build_object('task_id', NEW.id),
                'application/json',
                ARRAY[
                    http_header('Authorization', 'Bearer ' || service_role_key),
                    http_header('Content-Type', 'application/json')
                ]
            );
            
            -- Log the response for debugging
            RAISE LOG 'Task processing trigger called for task % with status %', NEW.id, response_status;
            
        EXCEPTION WHEN OTHERS THEN
            -- Don't fail the original transaction if the Edge Function call fails
            RAISE LOG 'Failed to call task processing Edge Function for task %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix broadcast_task_status_update
CREATE OR REPLACE FUNCTION broadcast_task_status_update()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    broadcast_channel text;
BEGIN
    -- Only broadcast for status changes on non-completed tasks
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
       OR (TG_OP = 'INSERT') THEN
        
        -- Skip completed tasks as they're handled by the processing trigger
        IF NEW.status IN ('Complete'::task_status, 'Failed'::task_status, 'Cancelled'::task_status) THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
        
        -- Get Supabase configuration
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
            -- Create broadcast channel name
            broadcast_channel := 'task-updates:' || NEW.project_id;
            
            -- Use Supabase Realtime broadcast for real-time updates
            -- This matches the existing useWebSocket hook expectations
            PERFORM supabase_realtime.broadcast(
                broadcast_channel,
                'task-update',
                json_build_object(
                    'type', 'TASKS_STATUS_UPDATE',
                    'payload', json_build_object(
                        'projectId', NEW.project_id,
                        'taskId', NEW.id,
                        'status', NEW.status::text,  -- Cast to text for JSON
                        'updated_at', NEW.updated_at
                    )
                )
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix create_generation_on_task_complete
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
            
            -- Extract shot_id if present
            shot_id := (normalized_params->'shot_id')::uuid;
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
        IF shot_id IS NOT NULL THEN
            -- Use the RPC function to handle positioning
            PERFORM add_generation_to_shot(shot_id, new_generation_id, true);
        END IF;
        
        -- Mark the task as having created a generation
        NEW.generation_created := TRUE;
        
        RAISE LOG '[ProcessTask] Created generation % for task %', new_generation_id, NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. UPDATE MONITORING VIEWS TO USE ENUM CASTING
-- ============================================================================

-- Update orchestrator_status view (drop first to ensure clean recreation)
DROP VIEW IF EXISTS orchestrator_status;
CREATE VIEW orchestrator_status AS
SELECT
    -- Task counts by status (with enum casting)
    COUNT(CASE WHEN t.status = 'Queued'::task_status THEN 1 END) as queued_tasks,
    COUNT(CASE WHEN t.status = 'In Progress'::task_status THEN 1 END) as running_tasks,
    COUNT(CASE WHEN t.status = 'Complete'::task_status THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'Failed'::task_status THEN 1 END) as error_tasks,
    COUNT(CASE WHEN t.status = 'Failed'::task_status THEN 1 END) as failed_tasks,
    
    -- Worker counts by status
    (SELECT COUNT(*) FROM workers WHERE status = 'inactive') as inactive_workers,
    (SELECT COUNT(*) FROM workers WHERE status = 'active') as active_workers,
    (SELECT COUNT(*) FROM workers WHERE status = 'terminated') as terminated_workers,
    
    -- Include external workers (your existing worker type)
    (SELECT COUNT(*) FROM workers WHERE instance_type = 'external' AND status = 'active') as external_workers,
    
    -- Health metrics
    (SELECT COUNT(*) FROM workers WHERE status IN ('active', 'external') AND last_heartbeat < NOW() - INTERVAL '5 minutes') as stale_workers,
    (SELECT COUNT(*) FROM tasks WHERE status = 'In Progress'::task_status AND generation_started_at < NOW() - INTERVAL '10 minutes') as stuck_tasks,
    
    -- Current timestamp
    NOW() as snapshot_time
FROM tasks t;

-- Update active_workers_health view (drop first to change column type)
DROP VIEW IF EXISTS active_workers_health;
CREATE VIEW active_workers_health AS
SELECT 
    w.id,
    w.instance_type,
    w.status,
    w.created_at,
    w.last_heartbeat,
    CASE 
        WHEN w.last_heartbeat IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - w.last_heartbeat))
        ELSE NULL
    END as heartbeat_age_seconds,
    
    -- VRAM metrics from metadata (if available)
    (w.metadata->>'vram_total_mb')::int as vram_total_mb,
    (w.metadata->>'vram_used_mb')::int as vram_used_mb,
    CASE 
        WHEN (w.metadata->>'vram_total_mb')::int > 0 THEN
            ROUND(((w.metadata->>'vram_used_mb')::numeric * 100.0) / (w.metadata->>'vram_total_mb')::numeric, 1)
        ELSE NULL
    END as vram_usage_percent,
    
    -- Current task info
    t.id as current_task_id,
    t.status::text as current_task_status,  -- Cast to text for display
    t.task_type as current_task_type,
    CASE 
        WHEN t.generation_started_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - t.generation_started_at))
        ELSE NULL
    END as task_runtime_seconds,
    
    -- Health indicators
    CASE 
        WHEN w.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'STALE_HEARTBEAT'
        WHEN t.generation_started_at < NOW() - INTERVAL '10 minutes' AND t.status = 'In Progress'::task_status THEN 'STUCK_TASK'
        WHEN w.status IN ('active', 'external') AND w.last_heartbeat IS NULL THEN 'NO_HEARTBEAT'
        WHEN w.status = 'inactive' THEN 'INACTIVE'
        WHEN w.status = 'terminated' THEN 'TERMINATED'
        ELSE 'HEALTHY'
    END as health_status
    
FROM workers w
LEFT JOIN tasks t ON t.worker_id = w.id AND t.status = 'In Progress'::task_status
WHERE w.status IN ('inactive', 'active', 'terminated')
ORDER BY w.created_at DESC;

-- ============================================================================
-- 3. UPDATE INDEXES TO USE ENUM CASTING
-- ============================================================================

-- Drop and recreate indexes with proper enum casting
DROP INDEX IF EXISTS idx_tasks_queued_created;
CREATE INDEX idx_tasks_queued_created ON tasks(created_at) 
WHERE status = 'Queued'::task_status;

DROP INDEX IF EXISTS idx_tasks_running_started;
CREATE INDEX idx_tasks_running_started ON tasks(generation_started_at) 
WHERE status = 'In Progress'::task_status;

DROP INDEX IF EXISTS idx_tasks_poll_travel_stitch;
CREATE INDEX idx_tasks_poll_travel_stitch
  ON tasks (task_type, status)
  WHERE generation_processed_at IS NULL
  AND task_type = 'travel_stitch'
  AND status = 'Complete'::task_status;

DROP INDEX IF EXISTS idx_tasks_poll_single_image;
CREATE INDEX idx_tasks_poll_single_image
  ON tasks (task_type, status)
  WHERE generation_processed_at IS NULL
  AND task_type = 'single_image'
  AND status = 'Complete'::task_status;

DROP INDEX IF EXISTS idx_tasks_active_status;
CREATE INDEX idx_tasks_active_status
  ON tasks (status, project_id)
  WHERE status NOT IN ('Complete'::task_status, 'Failed'::task_status, 'Cancelled'::task_status);

DROP INDEX IF EXISTS idx_tasks_status_generation_created;
CREATE INDEX idx_tasks_status_generation_created 
    ON tasks(status, generation_created) 
    WHERE status = 'Complete'::task_status AND generation_created = false;

-- ============================================================================
-- 4. FIX ANY REMAINING CLAIM FUNCTIONS
-- ============================================================================

-- Update func_get_tasks_by_status to handle enum properly
CREATE OR REPLACE FUNCTION func_get_tasks_by_status(status_filter text[])
RETURNS TABLE(
    id uuid,
    status text,
    attempts int,
    worker_id text,
    created_at timestamptz,
    generation_started_at timestamptz,
    generation_processed_at timestamptz,
    task_data jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.status::text,  -- Cast enum to text for output
        COALESCE(t.attempts, 0),
        t.worker_id,
        t.created_at,
        t.generation_started_at,
        t.generation_processed_at,
        t.params as task_data
    FROM tasks t
    WHERE t.status::text = ANY(status_filter)  -- Compare as text
    ORDER BY t.created_at ASC;
END;
$$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Test that all functions work with enum casting
SELECT 'Testing enum casting in triggers and views...' as test;

-- Check monitoring views
SELECT * FROM orchestrator_status LIMIT 1;
SELECT COUNT(*) FROM active_workers_health;

-- Show all updated objects
SELECT 
    'Functions' as object_type,
    p.proname as name,
    'Updated with enum casting' as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname IN ('process_completed_task_trigger', 'broadcast_task_status_update', 
                       'create_generation_on_task_complete', 'func_get_tasks_by_status')

UNION ALL

SELECT 
    'Views' as object_type,
    viewname as name,
    'Recreated with enum casting' as status
FROM pg_views
WHERE schemaname = 'public'
    AND viewname IN ('orchestrator_status', 'active_workers_health')

UNION ALL

SELECT 
    'Indexes' as object_type,
    indexname as name,
    'Recreated with enum casting' as status
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_tasks_%'
    AND tablename = 'tasks'
ORDER BY object_type, name; 
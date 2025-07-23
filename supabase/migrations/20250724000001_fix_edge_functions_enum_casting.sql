-- ============================================================================
-- FIX EDGE FUNCTIONS ENUM CASTING
-- ============================================================================
-- This migration creates helper functions that Edge Functions can use to
-- safely set task status values without worrying about enum casting.
-- ============================================================================

-- ============================================================================
-- 1. CREATE safe_update_task_status for Edge Functions
-- This function handles the enum casting internally
-- ============================================================================
CREATE OR REPLACE FUNCTION safe_update_task_status(
    p_task_id UUID,
    p_status TEXT,
    p_worker_id TEXT DEFAULT NULL,
    p_generation_started_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
BEGIN
    -- Update the task with proper enum casting
    UPDATE tasks
    SET
        status = p_status::task_status,
        worker_id = COALESCE(p_worker_id, worker_id),
        generation_started_at = COALESCE(p_generation_started_at, generation_started_at),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_task_id;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION safe_update_task_status(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION safe_update_task_status(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION safe_update_task_status(UUID, TEXT, TEXT, TIMESTAMPTZ) TO anon;

-- ============================================================================
-- 2. CREATE safe_insert_task for Edge Functions
-- This function handles task creation with proper enum casting
-- ============================================================================
CREATE OR REPLACE FUNCTION safe_insert_task(
    p_id UUID,
    p_project_id UUID,
    p_task_type TEXT,
    p_params JSONB,
    p_status TEXT DEFAULT 'Queued',
    p_dependant_on UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    inserted_id UUID;
BEGIN
    INSERT INTO tasks (
        id,
        project_id,
        task_type,
        params,
        status,
        dependant_on,
        created_at
    ) VALUES (
        p_id,
        p_project_id,
        p_task_type,
        p_params,
        p_status::task_status,
        p_dependant_on,
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO inserted_id;
    
    RETURN inserted_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION safe_insert_task(UUID, UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION safe_insert_task(UUID, UUID, TEXT, JSONB, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION safe_insert_task(UUID, UUID, TEXT, JSONB, TEXT, UUID) TO anon;

-- ============================================================================
-- 3. UPDATE existing functions to use enum casting
-- ============================================================================

-- Update func_update_task_status (from previous migration)
CREATE OR REPLACE FUNCTION func_update_task_status(
    p_task_id TEXT,
    p_status TEXT,
    p_table_name TEXT DEFAULT 'tasks',
    p_output_location TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
    task_uuid UUID;
BEGIN
    -- Convert TEXT task_id to UUID for compatibility
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Update the task status and output location (with enum casting)
    UPDATE tasks
    SET
        status = p_status::task_status,  -- Cast to enum type
        output_location = COALESCE(p_output_location, output_location),
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CASE 
            WHEN p_status = 'Complete' THEN CURRENT_TIMESTAMP 
            ELSE generation_processed_at 
        END
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update complete_task_with_timing
CREATE OR REPLACE FUNCTION complete_task_with_timing(
    p_task_id TEXT,
    p_output_location TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
    task_uuid UUID;
BEGIN
    -- Convert TEXT task_id to UUID for compatibility
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Complete the task with timing information
    UPDATE tasks
    SET
        status = 'Complete'::task_status,  -- Cast to enum type
        output_location = p_output_location,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update func_mark_task_failed
CREATE OR REPLACE FUNCTION func_mark_task_failed(
    p_task_id TEXT,
    p_error_message TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    rows_updated INTEGER;
    task_uuid UUID;
BEGIN
    -- Convert TEXT task_id to UUID for compatibility
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Mark the task as failed with error message
    UPDATE tasks
    SET
        status = 'Failed'::task_status,  -- Cast to enum type
        error_message = p_error_message,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Update existing claim functions to use enum casting
-- ============================================================================

-- Update the existing func_claim_available_task to use enum casting
CREATE OR REPLACE FUNCTION func_claim_available_task(worker_id_param text)
RETURNS TABLE(
    id uuid,
    status text,
    attempts int,
    worker_id text,
    generation_started_at timestamptz,
    task_data jsonb,
    created_at timestamptz,
    task_type text
) 
LANGUAGE plpgsql
AS $$
BEGIN
    -- First check if worker is marked for termination
    IF EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_id_param AND w.status = 'terminating') THEN
        RETURN; -- Don't assign new tasks to terminating workers
    END IF;
    
    -- Atomically claim the oldest queued task
    RETURN QUERY
    UPDATE tasks 
    SET 
        status = 'In Progress'::task_status,  -- Cast to enum
        worker_id = worker_id_param,
        generation_started_at = NOW()
    WHERE tasks.id = (
        SELECT t.id FROM tasks t
        WHERE t.status = 'Queued'::task_status  -- Cast to enum
          AND (t.worker_id IS NULL OR t.worker_id = '')
        ORDER BY t.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING 
        tasks.id,
        tasks.status::text,  -- Cast back to text for compatibility
        COALESCE(tasks.attempts, 0),
        tasks.worker_id,
        tasks.generation_started_at,
        tasks.params as task_data,
        tasks.created_at,
        tasks.task_type;
END;
$$;

-- Update func_mark_task_complete to use enum casting
CREATE OR REPLACE FUNCTION func_mark_task_complete(task_id_param uuid, result_data_param jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE tasks
    SET 
        status = 'Complete'::task_status,  -- Cast to enum
        generation_processed_at = NOW(),
        result_data = COALESCE(result_data_param, result_data),
        updated_at = NOW()
    WHERE id = task_id_param;
END;
$$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Test the new safe functions
SELECT 'Testing safe_update_task_status and safe_insert_task...' as test;

-- Show all updated functions
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname IN ('safe_update_task_status', 'safe_insert_task', 'func_update_task_status', 
                       'complete_task_with_timing', 'func_mark_task_failed', 'func_claim_available_task',
                       'func_mark_task_complete')
ORDER BY p.proname; 
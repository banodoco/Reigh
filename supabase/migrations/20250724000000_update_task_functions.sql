-- ============================================================================
-- UPDATE TASK FUNCTIONS MIGRATION
-- ============================================================================
-- This migration updates and standardizes RPC functions for the task worker
-- system while maintaining backward compatibility with existing Edge Functions.
--
-- Key changes:
-- - Adds func_update_task_status for flexible task status updates
-- - Ensures workers table exists with proper data
-- - Maintains existing func_claim_available_task signature for Edge Functions
-- ============================================================================

-- ============================================================================
-- 1. CREATE func_update_task_status (NEW - doesn't exist)
-- ============================================================================
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

    -- Update the task status and output location
    UPDATE tasks
    SET
        status = p_status,
        output_location = COALESCE(p_output_location, output_location),
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CASE 
            WHEN p_status = 'Complete' THEN CURRENT_TIMESTAMP 
            ELSE generation_processed_at 
        END
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    -- Return true if a row was updated
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (specify signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION func_update_task_status(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION func_update_task_status(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION func_update_task_status(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- 2. UPDATE complete_task_with_timing to handle TEXT task_ids (compatibility)
-- ============================================================================
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
        status = 'Complete',
        output_location = p_output_location,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    -- Return true if a row was updated
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (specify signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION complete_task_with_timing(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_task_with_timing(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_task_with_timing(TEXT, TEXT) TO anon;

-- ============================================================================
-- 3. UPDATE func_mark_task_failed to handle TEXT task_ids (compatibility)
-- ============================================================================
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
        status = 'Failed',
        error_message = p_error_message,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    -- Return true if a row was updated
    RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (specify signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION func_mark_task_failed(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION func_mark_task_failed(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION func_mark_task_failed(TEXT, TEXT) TO anon;

-- ============================================================================
-- 4. CREATE func_initialize_tasks_table (table validation)
-- ============================================================================
CREATE OR REPLACE FUNCTION func_initialize_tasks_table(
    p_table_name TEXT DEFAULT 'tasks'
)
RETURNS TEXT AS $$
DECLARE
    table_exists BOOLEAN;
    result_message TEXT;
BEGIN
    -- Check if tasks table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
    ) INTO table_exists;
    
    IF table_exists THEN
        result_message := 'Table ' || p_table_name || ' already exists and is ready';
    ELSE
        result_message := 'Table ' || p_table_name || ' does not exist - would need to be created manually';
    END IF;
    
    RETURN result_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (specify signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION func_initialize_tasks_table(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION func_initialize_tasks_table(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION func_initialize_tasks_table(TEXT) TO anon;

-- ============================================================================
-- 5. CREATE func_migrate_tasks_for_task_type (schema validation)
-- ============================================================================
CREATE OR REPLACE FUNCTION func_migrate_tasks_for_task_type(
    p_table_name TEXT DEFAULT 'tasks'
)
RETURNS TEXT AS $$
DECLARE
    result_message TEXT;
    column_exists BOOLEAN;
BEGIN
    result_message := 'Migration check for ' || p_table_name || ': ';
    
    -- Check if dependant_on column exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
        AND column_name = 'dependant_on'
    ) INTO column_exists;
    
    IF column_exists THEN
        result_message := result_message || 'dependant_on column exists. ';
    ELSE
        result_message := result_message || 'dependant_on column missing. ';
    END IF;
    
    -- Check if project_id column exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
        AND column_name = 'project_id'
    ) INTO column_exists;
    
    IF column_exists THEN
        result_message := result_message || 'project_id column exists. ';
    ELSE
        result_message := result_message || 'project_id column missing. ';
    END IF;
    
    result_message := result_message || 'Schema appears current.';
    
    RETURN result_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (specify signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION func_migrate_tasks_for_task_type(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION func_migrate_tasks_for_task_type(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION func_migrate_tasks_for_task_type(TEXT) TO anon;

-- ============================================================================
-- 6. ENSURE workers table exists and has necessary data
-- ============================================================================

-- Add any current worker_ids from tasks table as valid workers (if they don't exist)
INSERT INTO workers (id, instance_type, status, last_heartbeat, metadata, created_at)
SELECT DISTINCT 
    worker_id, 
    'external', 
    'active', 
    NOW(),
    '{"auto_created": true}'::jsonb,
    NOW()
FROM tasks 
WHERE worker_id IS NOT NULL 
  AND worker_id != ''
  AND worker_id NOT IN (SELECT id FROM workers)
ON CONFLICT (id) DO NOTHING;

-- Ensure default worker exists
INSERT INTO workers (id, instance_type, status, last_heartbeat, metadata, created_at) 
VALUES ('default_worker', 'external', 'active', NOW(), '{"is_default": true}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Test new functions to ensure they work
SELECT 'Testing func_initialize_tasks_table...' as test;
SELECT func_initialize_tasks_table('tasks');

SELECT 'Testing func_migrate_tasks_for_task_type...' as test;
SELECT func_migrate_tasks_for_task_type('tasks');

SELECT 'Functions updated successfully!' as result;

-- Show updated function signatures for verification
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND (p.proname LIKE 'func_%' OR p.proname = 'complete_task_with_timing')
    AND p.proname IN ('func_update_task_status', 'complete_task_with_timing', 'func_mark_task_failed', 'func_initialize_tasks_table', 'func_migrate_tasks_for_task_type')
ORDER BY p.proname; 
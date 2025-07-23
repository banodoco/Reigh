-- RPC Functions for existing schema
-- Updated to work with your existing workers and tasks table structure

-- Function to atomically claim the next available task (updated for existing schema)
CREATE OR REPLACE FUNCTION func_claim_available_task(worker_id_param text)
RETURNS TABLE(
    id uuid,
    status text,
    attempts int,
    worker_id text,
    generation_started_at timestamptz,
    task_data jsonb,  -- Will map to your 'params' column
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
        status = 'In Progress',
        worker_id = worker_id_param,
        generation_started_at = NOW()
    WHERE tasks.id = (
        SELECT t.id FROM tasks t
        WHERE t.status = 'Queued' AND (t.worker_id IS NULL OR t.worker_id = '')
        ORDER BY t.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING 
        tasks.id,
        tasks.status,
        COALESCE(tasks.attempts, 0),
        tasks.worker_id,
        tasks.generation_started_at,
        tasks.params as task_data,  -- Map params to task_data
        tasks.created_at,
        tasks.task_type;
END;
$$;

-- Function to mark a task as complete (updated for existing schema)
CREATE OR REPLACE FUNCTION func_mark_task_complete(task_id_param uuid, result_data_param jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE tasks
    SET 
        status = 'Complete',
        generation_processed_at = NOW(),
        result_data = COALESCE(result_data_param, result_data),
        updated_at = NOW()
    WHERE id = task_id_param;
END;
$$;

-- Function to mark a task as failed (increments attempts, updated for existing schema)
CREATE OR REPLACE FUNCTION func_mark_task_failed(task_id_param uuid, error_message_param text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE tasks
    SET 
        attempts = COALESCE(attempts, 0) + 1,
        status = CASE WHEN COALESCE(attempts, 0) + 1 >= 3 THEN 'Failed' ELSE 'Error' END,
        generation_processed_at = NOW(),
        error_message = error_message_param,
        worker_id = NULL,  -- Clear worker assignment for retry
        updated_at = NOW()
    WHERE id = task_id_param;
END;
$$;

-- Function to reset orphaned tasks from failed workers (updated for existing schema)
CREATE OR REPLACE FUNCTION func_reset_orphaned_tasks(failed_worker_ids text[])
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
    reset_count int;
BEGIN
    UPDATE tasks
    SET 
        status = 'Queued',
        worker_id = NULL,
        generation_started_at = NULL,
        updated_at = NOW()
    WHERE 
        worker_id = ANY(failed_worker_ids)
        AND status = 'In Progress'
        AND COALESCE(attempts, 0) < 3;  -- Don't retry tasks that have already failed too many times
    
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    RETURN reset_count;
END;
$$;

-- Function to update worker heartbeat with optional VRAM metrics (updated for existing schema)
CREATE OR REPLACE FUNCTION func_update_worker_heartbeat(
    worker_id_param text,
    vram_total_mb_param int DEFAULT NULL,
    vram_used_mb_param int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    current_metadata jsonb;
BEGIN
    -- Get current metadata or initialize empty
    SELECT COALESCE(metadata, '{}'::jsonb) INTO current_metadata 
    FROM workers WHERE id = worker_id_param;
    
    -- Update metadata with VRAM info if provided
    IF vram_total_mb_param IS NOT NULL THEN
        current_metadata = current_metadata || 
            jsonb_build_object(
                'vram_total_mb', vram_total_mb_param,
                'vram_used_mb', COALESCE(vram_used_mb_param, 0),
                'vram_timestamp', extract(epoch from NOW())
            );
    END IF;
    
    -- Update heartbeat and metadata
    UPDATE workers
    SET 
        last_heartbeat = NOW(),
        metadata = current_metadata
    WHERE id = worker_id_param;
    
    -- If worker doesn't exist, create it as external worker
    IF NOT FOUND THEN
        INSERT INTO workers (id, instance_type, status, last_heartbeat, metadata, created_at)
        VALUES (
            worker_id_param, 
            'external', 
            'active', 
            NOW(), 
            current_metadata,
            NOW()
        );
    END IF;
END;
$$;

-- Function to get tasks by status (helper for orchestrator)
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
        t.status,
        COALESCE(t.attempts, 0),
        t.worker_id,
        t.created_at,
        t.generation_started_at,
        t.generation_processed_at,
        t.params as task_data
    FROM tasks t
    WHERE t.status = ANY(status_filter)
    ORDER BY t.created_at ASC;
END;
$$; 
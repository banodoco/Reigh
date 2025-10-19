-- Add status_param to func_worker_heartbeat_with_logs
-- This allows workers to update their status field (e.g., 'active' or 'crashed')
-- when sending heartbeats

CREATE OR REPLACE FUNCTION func_worker_heartbeat_with_logs(
    worker_id_param text,
    vram_total_mb_param int DEFAULT NULL,
    vram_used_mb_param int DEFAULT NULL,
    logs_param jsonb DEFAULT '[]'::jsonb,
    current_task_id_param uuid DEFAULT NULL,
    status_param text DEFAULT 'active'  -- NEW: Allow status updates via heartbeat
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with function owner's privileges (bypasses RLS)
SET search_path = public  -- Security best practice with SECURITY DEFINER
AS $$
DECLARE
    current_metadata jsonb;
    log_entry jsonb;
    inserted_count int := 0;
    error_count int := 0;
BEGIN
    -- 1. Update worker heartbeat (existing functionality)
    SELECT COALESCE(metadata, '{}'::jsonb) INTO current_metadata 
    FROM workers WHERE id = worker_id_param;
    
    -- Add VRAM metrics if provided
    IF vram_total_mb_param IS NOT NULL THEN
        current_metadata = current_metadata || 
            jsonb_build_object(
                'vram_total_mb', vram_total_mb_param,
                'vram_used_mb', COALESCE(vram_used_mb_param, 0),
                'vram_timestamp', extract(epoch from NOW())
            );
    END IF;
    
    -- Update heartbeat timestamp, metadata, and status
    UPDATE workers
    SET 
        last_heartbeat = NOW(),
        metadata = current_metadata,
        status = status_param  -- NEW: Update status field
    WHERE id = worker_id_param;
    
    -- If worker doesn't exist, create it as external worker
    IF NOT FOUND THEN
        INSERT INTO workers (id, instance_type, status, last_heartbeat, metadata, created_at)
        VALUES (
            worker_id_param, 
            'external', 
            status_param,  -- NEW: Use status_param instead of hardcoded 'active'
            NOW(), 
            current_metadata,
            NOW()
        );
    END IF;
    
    -- 2. Insert log entries in batch
    IF jsonb_array_length(logs_param) > 0 THEN
        FOR log_entry IN SELECT * FROM jsonb_array_elements(logs_param)
        LOOP
            BEGIN
                INSERT INTO system_logs (
                    timestamp,
                    source_type,
                    source_id,
                    log_level,
                    message,
                    task_id,
                    worker_id,
                    metadata
                ) VALUES (
                    COALESCE((log_entry->>'timestamp')::timestamptz, NOW()),
                    'worker',
                    worker_id_param,
                    COALESCE(log_entry->>'level', 'INFO'),
                    log_entry->>'message',
                    COALESCE((log_entry->>'task_id')::uuid, current_task_id_param),
                    worker_id_param,
                    COALESCE(log_entry->'metadata', '{}'::jsonb)
                );
                inserted_count := inserted_count + 1;
            EXCEPTION WHEN OTHERS THEN
                error_count := error_count + 1;
                -- Continue with other entries
            END;
        END LOOP;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'heartbeat_updated', true,
        'logs_inserted', inserted_count,
        'log_errors', error_count
    );
END;
$$;

-- Ensure permissions are still set correctly (must specify full signature for overloaded functions)
GRANT EXECUTE ON FUNCTION func_worker_heartbeat_with_logs(text, int, int, jsonb, uuid, text) TO authenticated, anon, service_role;

-- Update comment (must specify full signature for overloaded functions)
COMMENT ON FUNCTION func_worker_heartbeat_with_logs(text, int, int, jsonb, uuid, text) IS 'Enhanced heartbeat with logs and status updates. Uses SECURITY DEFINER to bypass RLS on workers table. Allows workers to report status (active/crashed).';


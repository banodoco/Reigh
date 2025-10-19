-- Fix heartbeat functions to use SECURITY DEFINER
-- This allows workers with anon/authenticated keys to update the workers table
-- which has RLS policies that only allow service_role to manage workers

-- Fix func_worker_heartbeat_with_logs
CREATE OR REPLACE FUNCTION func_worker_heartbeat_with_logs(
    worker_id_param text,
    vram_total_mb_param int DEFAULT NULL,
    vram_used_mb_param int DEFAULT NULL,
    logs_param jsonb DEFAULT '[]'::jsonb,
    current_task_id_param uuid DEFAULT NULL
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
    
    -- Update heartbeat timestamp and metadata
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

-- Fix func_update_worker_heartbeat (simpler version without logs)
CREATE OR REPLACE FUNCTION func_update_worker_heartbeat(
    worker_id_param text,
    vram_total_mb_param int DEFAULT NULL,
    vram_used_mb_param int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with function owner's privileges (bypasses RLS)
SET search_path = public  -- Security best practice with SECURITY DEFINER
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

-- Ensure permissions are set correctly
GRANT EXECUTE ON FUNCTION func_worker_heartbeat_with_logs TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION func_update_worker_heartbeat TO authenticated, anon, service_role;

-- Add comments
COMMENT ON FUNCTION func_worker_heartbeat_with_logs IS 'Enhanced heartbeat with logs. Uses SECURITY DEFINER to bypass RLS on workers table.';
COMMENT ON FUNCTION func_update_worker_heartbeat IS 'Update worker heartbeat and VRAM usage. Uses SECURITY DEFINER to bypass RLS on workers table.';


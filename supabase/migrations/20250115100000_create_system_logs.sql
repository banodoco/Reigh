-- =====================================================================
-- System Logs Table and Functions
-- Created: 2025-01-15
-- Purpose: Centralized logging system for orchestrators and workers
-- =====================================================================

-- Create system_logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp timestamptz NOT NULL DEFAULT NOW(),
    
    -- Source identification
    source_type text NOT NULL,  -- 'orchestrator_gpu', 'orchestrator_api', 'worker'
    source_id text NOT NULL,    -- worker_id or orchestrator instance id
    
    -- Log details
    log_level text NOT NULL,    -- 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
    message text NOT NULL,
    
    -- Context fields for filtering
    task_id uuid,               -- NULL for non-task logs
    worker_id text,             -- NULL for orchestrator-only logs
    cycle_number int,           -- For orchestrator cycle tracking
    
    -- Additional metadata
    metadata jsonb DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT valid_log_level CHECK (log_level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    CONSTRAINT valid_source_type CHECK (source_type IN ('orchestrator_gpu', 'orchestrator_api', 'worker'))
);

-- Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs (source_type, source_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_task ON system_logs (task_id, timestamp DESC) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_worker ON system_logs (worker_id, timestamp DESC) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs (log_level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_cycle ON system_logs (source_type, cycle_number) WHERE cycle_number IS NOT NULL;

-- =====================================================================
-- RPC Function: Insert logs in batch (for orchestrators)
-- =====================================================================
CREATE OR REPLACE FUNCTION func_insert_logs_batch(logs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    log_entry jsonb;
    inserted_count int := 0;
    error_count int := 0;
BEGIN
    -- Iterate through log entries and insert
    FOR log_entry IN SELECT * FROM jsonb_array_elements(logs)
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
                cycle_number,
                metadata
            ) VALUES (
                COALESCE((log_entry->>'timestamp')::timestamptz, NOW()),
                log_entry->>'source_type',
                log_entry->>'source_id',
                log_entry->>'log_level',
                log_entry->>'message',
                (log_entry->>'task_id')::uuid,
                log_entry->>'worker_id',
                (log_entry->>'cycle_number')::int,
                COALESCE(log_entry->'metadata', '{}'::jsonb)
            );
            inserted_count := inserted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            -- Continue with other entries even if one fails
        END;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'inserted', inserted_count,
        'errors', error_count
    );
END;
$$;

-- =====================================================================
-- RPC Function: Enhanced worker heartbeat with logs
-- =====================================================================
CREATE OR REPLACE FUNCTION func_worker_heartbeat_with_logs(
    worker_id_param text,
    vram_total_mb_param int DEFAULT NULL,
    vram_used_mb_param int DEFAULT NULL,
    logs_param jsonb DEFAULT '[]'::jsonb,
    current_task_id_param uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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

-- =====================================================================
-- Function: Automatic cleanup of old logs
-- =====================================================================
CREATE OR REPLACE FUNCTION func_cleanup_old_logs(
    retention_hours int DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count int;
BEGIN
    DELETE FROM system_logs 
    WHERE timestamp < NOW() - (retention_hours || ' hours')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', true,
        'deleted', deleted_count,
        'retention_hours', retention_hours
    );
END;
$$;

-- =====================================================================
-- Helper view: Recent errors summary
-- =====================================================================
CREATE OR REPLACE VIEW v_recent_errors AS
SELECT 
    source_type,
    source_id,
    worker_id,
    task_id,
    COUNT(*) as error_count,
    MAX(timestamp) as last_error_time,
    array_agg(DISTINCT message ORDER BY message) as unique_messages
FROM system_logs
WHERE 
    log_level = 'ERROR' 
    AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY source_type, source_id, worker_id, task_id
ORDER BY error_count DESC, last_error_time DESC;

-- =====================================================================
-- Helper view: Worker log activity
-- =====================================================================
CREATE OR REPLACE VIEW v_worker_log_activity AS
SELECT 
    w.id as worker_id,
    w.status,
    w.last_heartbeat,
    COUNT(l.id) as log_count,
    COUNT(l.id) FILTER (WHERE l.log_level = 'ERROR') as error_count,
    COUNT(l.id) FILTER (WHERE l.log_level = 'WARNING') as warning_count,
    MAX(l.timestamp) as last_log_time
FROM workers w
LEFT JOIN system_logs l ON l.worker_id = w.id 
    AND l.timestamp > NOW() - INTERVAL '1 hour'
WHERE w.status IN ('active', 'spawning', 'inactive')
GROUP BY w.id, w.status, w.last_heartbeat
ORDER BY last_log_time DESC NULLS LAST;

-- =====================================================================
-- Permissions (if using RLS)
-- =====================================================================
-- Grant execute permissions on RPC functions
GRANT EXECUTE ON FUNCTION func_insert_logs_batch TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION func_worker_heartbeat_with_logs TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION func_cleanup_old_logs TO authenticated, anon, service_role;

-- Grant table permissions
GRANT SELECT, INSERT ON system_logs TO authenticated, anon, service_role;
GRANT SELECT ON v_recent_errors TO authenticated, anon, service_role;
GRANT SELECT ON v_worker_log_activity TO authenticated, anon, service_role;

-- =====================================================================
-- Comments for documentation
-- =====================================================================
COMMENT ON TABLE system_logs IS 'Centralized logging for orchestrators and workers. Auto-cleaned after 48 hours.';
COMMENT ON COLUMN system_logs.source_type IS 'Type of source: orchestrator_gpu, orchestrator_api, or worker';
COMMENT ON COLUMN system_logs.source_id IS 'Unique identifier for the source (worker_id or orchestrator instance)';
COMMENT ON COLUMN system_logs.cycle_number IS 'Orchestrator cycle number for timeline reconstruction';
COMMENT ON FUNCTION func_insert_logs_batch IS 'Batch insert logs from orchestrators. Used by DatabaseLogHandler.';
COMMENT ON FUNCTION func_worker_heartbeat_with_logs IS 'Enhanced heartbeat that includes log batch from workers.';
COMMENT ON FUNCTION func_cleanup_old_logs IS 'Delete logs older than specified retention period (default 48 hours).';


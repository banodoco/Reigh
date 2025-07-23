-- Monitoring views for existing schema
-- Updated to work with your existing workers and tasks table structure

-- View: Queue and worker status overview (updated for existing schema)
CREATE OR REPLACE VIEW orchestrator_status AS
SELECT
    -- Task counts by status
    COUNT(CASE WHEN t.status = 'Queued' THEN 1 END) as queued_tasks,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as running_tasks,
    COUNT(CASE WHEN t.status = 'Complete' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'Failed' THEN 1 END) as error_tasks,
    COUNT(CASE WHEN t.status = 'Failed' THEN 1 END) as failed_tasks,
    
    -- Worker counts by status
    (SELECT COUNT(*) FROM workers WHERE status = 'inactive') as inactive_workers,
    (SELECT COUNT(*) FROM workers WHERE status = 'active') as active_workers,
    (SELECT COUNT(*) FROM workers WHERE status = 'terminated') as terminated_workers,
    
    -- Include external workers (your existing worker type)
    (SELECT COUNT(*) FROM workers WHERE instance_type = 'external' AND status = 'active') as external_workers,
    
    -- Health metrics
    (SELECT COUNT(*) FROM workers WHERE status IN ('active', 'external') AND last_heartbeat < NOW() - INTERVAL '5 minutes') as stale_workers,
    (SELECT COUNT(*) FROM tasks WHERE status = 'In Progress' AND generation_started_at < NOW() - INTERVAL '10 minutes') as stuck_tasks,
    
    -- Current timestamp
    NOW() as snapshot_time
FROM tasks t;

-- View: Active workers with health details (updated for existing schema)
CREATE OR REPLACE VIEW active_workers_health AS
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
    t.status as current_task_status,
    t.task_type as current_task_type,
    CASE 
        WHEN t.generation_started_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - t.generation_started_at))
        ELSE NULL
    END as task_runtime_seconds,
    
    -- Health indicators
    CASE 
        WHEN w.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'STALE_HEARTBEAT'
        WHEN t.generation_started_at < NOW() - INTERVAL '10 minutes' AND t.status = 'In Progress' THEN 'STUCK_TASK'
        WHEN w.status IN ('active', 'external') AND w.last_heartbeat IS NULL THEN 'NO_HEARTBEAT'
        WHEN w.status = 'inactive' THEN 'INACTIVE'
        WHEN w.status = 'terminated' THEN 'TERMINATED'
        ELSE 'HEALTHY'
    END as health_status
    
FROM workers w
LEFT JOIN tasks t ON t.worker_id = w.id AND t.status = 'In Progress'
WHERE w.status IN ('inactive', 'active', 'terminated')
ORDER BY w.created_at DESC;

-- View: Recent task activity and errors (updated for existing schema)
CREATE OR REPLACE VIEW recent_task_activity AS
SELECT 
    t.id,
    t.status,
    t.task_type,
    COALESCE(t.attempts, 0) as attempts,
    t.worker_id,
    t.created_at,
    t.generation_started_at,
    t.generation_processed_at,
    t.updated_at,
    t.error_message,
    
    -- Task duration
    CASE 
        WHEN t.generation_processed_at IS NOT NULL AND t.generation_started_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (t.generation_processed_at - t.generation_started_at))
        WHEN t.generation_started_at IS NOT NULL AND t.status = 'In Progress' THEN
            EXTRACT(EPOCH FROM (NOW() - t.generation_started_at))
        ELSE NULL
    END as processing_duration_seconds,
    
    -- Worker info
    w.instance_type as worker_instance_type,
    w.status as worker_status
    
FROM tasks t
LEFT JOIN workers w ON w.id = t.worker_id
WHERE t.created_at > NOW() - INTERVAL '24 hours'
ORDER BY t.created_at DESC
LIMIT 100;

-- View: Worker utilization and performance
CREATE OR REPLACE VIEW worker_performance AS
SELECT 
    w.id as worker_id,
    w.instance_type,
    w.status,
    w.created_at as worker_created_at,
    w.last_heartbeat,
    
    -- Task counts
    COUNT(t.id) as total_tasks_processed,
    COUNT(CASE WHEN t.status = 'Complete' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'Failed' THEN 1 END) as error_tasks,
    COUNT(CASE WHEN t.status = 'Failed' THEN 1 END) as failed_tasks,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as current_running_tasks,
    
    -- Success rate
    CASE 
        WHEN COUNT(t.id) > 0 THEN
            ROUND((COUNT(CASE WHEN t.status = 'Complete' THEN 1 END)::numeric / COUNT(t.id)::numeric) * 100, 1)
        ELSE NULL
    END as success_rate_percent,
    
    -- Average processing time (for completed tasks)
    AVG(
        CASE WHEN t.status = 'Complete' AND t.generation_started_at IS NOT NULL AND t.generation_processed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (t.generation_processed_at - t.generation_started_at))
        ELSE NULL END
    ) as avg_processing_time_seconds,
    
    -- Worker uptime
    CASE 
        WHEN w.status IN ('active', 'external') THEN
            EXTRACT(EPOCH FROM (NOW() - w.created_at)) / 3600.0
        ELSE NULL
    END as uptime_hours
    
FROM workers w
LEFT JOIN tasks t ON t.worker_id = w.id
WHERE w.created_at > NOW() - INTERVAL '7 days'
GROUP BY w.id, w.instance_type, w.status, w.created_at, w.last_heartbeat
ORDER BY w.created_at DESC;

-- View: Task queue analysis
CREATE OR REPLACE VIEW task_queue_analysis AS
SELECT 
    task_type,
    status,
    COUNT(*) as task_count,
    
    -- Age statistics for queued tasks
    CASE WHEN status = 'Queued' THEN
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60.0)
    ELSE NULL END as avg_queue_time_minutes,
    
    CASE WHEN status = 'Queued' THEN
        MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60.0)
    ELSE NULL END as max_queue_time_minutes,
    
    -- Processing time for completed tasks
    CASE WHEN status = 'Complete' THEN
        AVG(EXTRACT(EPOCH FROM (generation_processed_at - generation_started_at)))
    ELSE NULL END as avg_processing_time_seconds,
    
    -- Error rate
    COUNT(CASE WHEN status IN ('Failed', 'Cancelled') THEN 1 END) as error_count
    
FROM tasks
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY task_type, status
ORDER BY task_type, 
    CASE status 
        WHEN 'Queued' THEN 1 
        WHEN 'In Progress' THEN 2 
        WHEN 'Complete' THEN 3 
        WHEN 'Failed' THEN 4 
        WHEN 'Cancelled' THEN 5 
        ELSE 6 
    END; 
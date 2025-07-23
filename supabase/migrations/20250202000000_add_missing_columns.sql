-- Add missing columns to existing workers table
-- (Only adds columns that don't already exist)

DO $$ 
BEGIN
    -- Add attempts column to tasks if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tasks' AND column_name='attempts') THEN
        ALTER TABLE tasks ADD COLUMN attempts int NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added attempts column to tasks table';
    ELSE
        RAISE NOTICE 'attempts column already exists in tasks table';
    END IF;
    
    -- Add error_message to tasks if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tasks' AND column_name='error_message') THEN
        ALTER TABLE tasks ADD COLUMN error_message text;
        RAISE NOTICE 'Added error_message column to tasks table';
    ELSE
        RAISE NOTICE 'error_message column already exists in tasks table';
    END IF;
    
    -- Add task_data column to tasks if it doesn't exist (map to existing params)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tasks' AND column_name='task_data') THEN
        -- Create a computed view of params as task_data for compatibility
        RAISE NOTICE 'Will use existing params column as task_data';
    ELSE
        RAISE NOTICE 'task_data column already exists in tasks table';
    END IF;
    
    -- Add result_data column to tasks if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tasks' AND column_name='result_data') THEN
        ALTER TABLE tasks ADD COLUMN result_data jsonb DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added result_data column to tasks table';
    ELSE
        RAISE NOTICE 'result_data column already exists in tasks table';
    END IF;

END $$;

-- Create indexes for orchestrator performance on existing tables
CREATE INDEX IF NOT EXISTS idx_tasks_status_worker ON tasks(status, worker_id);
CREATE INDEX IF NOT EXISTS idx_tasks_queued_created ON tasks(created_at) WHERE status = 'Queued';
CREATE INDEX IF NOT EXISTS idx_tasks_running_started ON tasks(generation_started_at) WHERE status = 'In Progress';
CREATE INDEX IF NOT EXISTS idx_workers_status_heartbeat ON workers(status, last_heartbeat);

-- Create a view to normalize status values (since your existing table uses different status names)
CREATE OR REPLACE VIEW normalized_task_status AS
SELECT 
    id,
    CASE 
        WHEN status = 'Complete' THEN 'Complete'
        WHEN status = 'In Progress' THEN 'In Progress' 
        WHEN status = 'Queued' THEN 'Queued'
        WHEN status = 'Failed' THEN 'Failed'
        WHEN status = 'Cancelled' THEN 'Cancelled'
        ELSE status  -- Keep original if it matches
    END as normalized_status,
    status as original_status
FROM tasks; 
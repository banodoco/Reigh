-- Clean up unused database triggers and functions
-- These were replaced by direct function calls in the complete_task Edge Function

-- Drop the trigger that called process-completed-task (which we've now deleted)
DROP TRIGGER IF EXISTS trigger_process_completed_tasks ON tasks;

-- Drop the function that was used to call process-completed-task
DROP FUNCTION IF EXISTS process_completed_task_trigger();

-- Comment on what replaced this system
COMMENT ON TABLE tasks IS 'Task completion processing is now handled by the complete_task Edge Function calling calculate-task-cost directly, eliminating the need for database triggers to call external functions.';

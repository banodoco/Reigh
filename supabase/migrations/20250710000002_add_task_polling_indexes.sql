-- Add indexes to improve task polling performance
-- This index speeds up the recurring queries from taskProcessingService.ts

-- Index for polling completed travel_stitch tasks
CREATE INDEX IF NOT EXISTS idx_tasks_poll_travel_stitch
  ON tasks (task_type, status)
  WHERE generation_processed_at IS NULL
  AND task_type = 'travel_stitch'
  AND status = 'Complete';

-- Index for polling completed single_image tasks  
CREATE INDEX IF NOT EXISTS idx_tasks_poll_single_image
  ON tasks (task_type, status)
  WHERE generation_processed_at IS NULL
  AND task_type = 'single_image'
  AND status = 'Complete';

-- General index for active task status polling (non-complete/failed/cancelled)
CREATE INDEX IF NOT EXISTS idx_tasks_active_status
  ON tasks (status, project_id)
  WHERE status NOT IN ('Complete', 'Failed', 'Cancelled');

-- Index for finding dependent tasks (for cascade operations)
CREATE INDEX IF NOT EXISTS idx_tasks_dependant_on
  ON tasks USING gin (dependant_on);

-- Add index on created_at for better ordering performance
CREATE INDEX IF NOT EXISTS idx_tasks_created_at
  ON tasks (created_at DESC); 
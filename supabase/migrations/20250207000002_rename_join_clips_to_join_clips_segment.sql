-- Rename join_clips to join_clips_segment to match orchestrator pattern
-- This migration updates the existing join_clips task type to the new naming convention

-- Update the task type name
UPDATE task_types
SET 
  name = 'join_clips_segment',
  display_name = 'Join Clips Segment',
  description = 'Individual join segment generation (part of join clips orchestrator workflow)',
  updated_at = now()
WHERE name = 'join_clips';

-- Update any existing tasks that reference the old name
UPDATE tasks
SET task_type = 'join_clips_segment'
WHERE task_type = 'join_clips';

-- Verify the rename was successful
SELECT 
  name,
  category,
  tool_type,
  content_type,
  run_type,
  billing_type,
  base_cost_per_second,
  display_name,
  is_active
FROM task_types 
WHERE name IN ('join_clips_segment', 'join_clips_orchestrator')
ORDER BY name;

-- Log confirmation
SELECT 'Renamed join_clips to join_clips_segment and updated existing tasks' as status;








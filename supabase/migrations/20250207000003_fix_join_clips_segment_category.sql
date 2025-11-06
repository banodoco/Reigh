-- Fix join_clips_segment category to match travel_segment pattern
-- Segment tasks should be 'processing' not 'generation'
-- The generation is created by the orchestrator, not individual segments
-- Note: complete_task now has logic to skip generation for sub-tasks regardless of category

UPDATE task_types
SET 
  category = 'processing',
  description = 'Individual join segment processing (part of join clips orchestrator workflow)',
  updated_at = now()
WHERE name = 'join_clips_segment'
  AND category != 'processing';

-- Verify the update
SELECT 
  name,
  category,
  tool_type,
  content_type,
  display_name,
  description
FROM task_types 
WHERE name IN ('travel_segment', 'join_clips_segment')
ORDER BY name;

-- Log confirmation
SELECT 'Updated join_clips_segment category to processing (matching travel_segment pattern)' as status;


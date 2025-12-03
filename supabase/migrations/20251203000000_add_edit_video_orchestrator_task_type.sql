-- Add edit_video_orchestrator task type to support video portion regeneration workflows
-- This orchestrator coordinates regenerating selected portions of a video
-- Similar to join_clips_orchestrator pattern for complex multi-step workflows

INSERT INTO task_types (
  name,
  run_type,
  category,
  tool_type,
  content_type,
  display_name,
  description,
  billing_type,
  unit_cost,
  base_cost_per_second,
  cost_factors,
  is_active
) VALUES (
  'edit_video_orchestrator',
  'gpu',                                           -- GPU-based orchestration service
  'orchestration',                                 -- Orchestration category (not 'generation' - doesn't create generations directly)
  'edit-video',                                    -- Tool type for filtering
  'video',                                         -- Produces video output
  'Edit Video',
  'Regenerate selected portions of a video with AI-generated content',
  'per_second',                                    -- Billed per second of generated video
  0.000001,                                        -- Minimal unit cost (required field, not used for per_second)
  0.027800,                                        -- $0.0278 per second (same as join_clips_segment and travel_segment)
  '{}'::jsonb,                                     -- No additional cost factors for now
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  run_type = EXCLUDED.run_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  cost_factors = EXCLUDED.cost_factors,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Also add the segment task type for individual portion regeneration
INSERT INTO task_types (
  name,
  run_type,
  category,
  tool_type,
  content_type,
  display_name,
  description,
  billing_type,
  unit_cost,
  base_cost_per_second,
  cost_factors,
  is_active
) VALUES (
  'edit_video_segment',
  'gpu',                                           -- GPU-based generation
  'processing',                                    -- Processing category (subtask)
  'edit-video',                                    -- Tool type for filtering
  'video',                                         -- Produces video output
  'Edit Video Segment',
  'Regenerate a single portion of a video (part of edit video workflow)',
  'per_second',                                    -- Billed per second of generated video
  0.000001,                                        -- Minimal unit cost (required field, not used for per_second)
  0.027800,                                        -- $0.0278 per second
  '{}'::jsonb,                                     -- No additional cost factors for now
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  run_type = EXCLUDED.run_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  cost_factors = EXCLUDED.cost_factors,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Verify the task types were added correctly
SELECT 
  name,
  category,
  tool_type,
  content_type,
  run_type,
  billing_type,
  base_cost_per_second,
  is_active
FROM task_types 
WHERE name IN ('edit_video_orchestrator', 'edit_video_segment');

-- Log confirmation
SELECT 'Added edit_video_orchestrator and edit_video_segment task types' as status;


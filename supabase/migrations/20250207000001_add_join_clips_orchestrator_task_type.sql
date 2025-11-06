-- Add join_clips_orchestrator task type to support multi-clip joining workflows
-- This orchestrator coordinates multiple join operations between clips with per-join settings
-- Similar to travel_orchestrator pattern for complex multi-step workflows
-- Note: join_clips_segment is added in migration 20250109000000_add_join_clips_task_type.sql

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
  'join_clips_orchestrator',
  'gpu',                                           -- GPU-based orchestration service
  'orchestration',                                 -- Orchestration category (not 'generation' - doesn't create generations directly)
  'join-clips',                                    -- Tool type for filtering
  'video',                                         -- Produces video output
  'Join Clips',
  'Orchestrate multi-clip joining workflow with per-join settings and AI-generated transitions',
  'per_second',                                    -- Billed per second of generated video
  0.000001,                                       -- Minimal unit cost (required field, not used for per_second)
  0.027800,                                       -- $0.0278 per second (same as join_clips_segment and travel_segment)
  '{}'::jsonb,                                    -- No additional cost factors for now
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

-- Verify the task type was added correctly
SELECT 
  name,
  category,
  tool_type,
  content_type,
  run_type,
  billing_type,
  base_cost_per_second,
  cost_factors,
  is_active
FROM task_types 
WHERE name = 'join_clips_orchestrator';

-- Log confirmation
SELECT 'Added join_clips_orchestrator task type' as status;


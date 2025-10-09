-- Add join_clips task type to support video clip joining with AI-generated transitions
-- This task type needs to be registered in task_types table for the generation trigger to process it

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
  'join_clips',
  'gpu',                                           -- GPU-based video generation service
  'generation',                                    -- CRITICAL: Must be 'generation' for trigger to process
  'join-clips',                                    -- Tool type for filtering generations
  'video',                                         -- Produces video output
  'Join Clips',
  'Join two video clips with AI-generated transitions using VACE',
  'per_second',                                    -- Billed per second of generated video
  0.000001,                                       -- Minimal unit cost (required field, not used for per_second)
  0.027800,                                       -- $0.0278 per second (same as travel_segment)
  '{}'::jsonb,                                    -- No additional cost factors for now
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,                    -- Ensure category is 'generation'
  tool_type = EXCLUDED.tool_type,                  -- Ensure tool_type is correct
  content_type = EXCLUDED.content_type,            -- Ensure content_type is 'video'
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
WHERE name = 'join_clips';

-- Log confirmation
SELECT 'Added join_clips task type with generation category for trigger processing' as status;


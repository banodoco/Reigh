-- Add image-upscale task type to task_types table
-- This is an API-based task with per-unit billing at $0.0015 per upscale

INSERT INTO task_types (
  name,
  run_type,
  category,
  display_name,
  description,
  base_cost_per_second,
  billing_type,
  unit_cost,
  tool_type,
  is_active
) VALUES (
  'image-upscale',
  'api',
  'upscale',
  'Image Upscale',
  'Upscale image to higher resolution using AI',
  0.0,  -- base_cost_per_second is 0 for per_unit billing
  'per_unit',
  0.0015,  -- $0.0015 per upscale
  'image-upscale',
  true
);

-- Verify the task type was added
SELECT 'image-upscale task type added to task_types table' as status;


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
  content_type,
  is_active
) VALUES (
  'image_upscale',
  'api',
  'processing',
  'Image Upscale',
  'Upscale image to higher resolution using AI',
  0.0,  -- base_cost_per_second is 0 for per_unit billing
  'per_unit',
  0.0015,  -- $0.0015 per upscale
  'processing',
  'image',
  true
)
ON CONFLICT (name) DO NOTHING;

-- Verify the task type was added
SELECT 'image_upscale task type added to task_types table' as status;


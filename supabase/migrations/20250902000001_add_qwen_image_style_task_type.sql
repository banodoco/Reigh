-- Add qwen_image_style task type to support Qwen.Image model generation
-- This task type needs to be registered in task_types table for the generation trigger to process it

INSERT INTO task_types (
  name,
  run_type,
  category,
  display_name,
  description,
  billing_type,
  unit_cost,
  base_cost_per_second,
  cost_factors,
  is_active
) VALUES (
  'qwen_image_style',
  'api',                                           -- Qwen.Image is an API-based model
  'generation',                                    -- CRITICAL: Must be 'generation' for trigger to process
  'Qwen.Image Style Generation',
  'Generate images using Qwen.Image model with style reference guidance',
  'per_unit',                                      -- Billed per image generated
  0.030,                                          -- $0.030 per image (similar to other image generation)
  0.000001,                                       -- Minimal base cost (required field, not used for per_unit)
  '{}',                                           -- No additional cost factors
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,                    -- Ensure category is 'generation'
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Verify the task type was added correctly
SELECT 
  name,
  category,
  run_type,
  billing_type,
  unit_cost,
  is_active
FROM task_types 
WHERE name = 'qwen_image_style';

-- Log confirmation
SELECT 'Added qwen_image_style task type with generation category for trigger processing' as status;

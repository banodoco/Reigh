-- Add animate_character task type to support Wan2.2-Animate character animation
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
  'animate_character',
  'api',                                           -- Wan2.2-Animate is an API-based service
  'generation',                                    -- CRITICAL: Must be 'generation' for trigger to process
  'character-animate',                             -- Tool type for filtering generations
  'video',                                         -- Produces video output
  'Character Animate',
  'Animate static character images using motion from reference videos with Wan2.2-Animate',
  'per_unit',                                      -- Billed per animation generated
  0.200,                                          -- $0.20 per animation (480p base, 5s)
  0.000001,                                       -- Minimal base cost (required field, not used for per_unit)
  '{
    "resolution_480p": 0.20,
    "resolution_720p": 0.40
  }'::jsonb,                                      -- Cost factors for different resolutions
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,                    -- Ensure category is 'generation'
  tool_type = EXCLUDED.tool_type,                  -- Ensure tool_type is correct
  content_type = EXCLUDED.content_type,            -- Ensure content_type is 'video'
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
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
  unit_cost,
  cost_factors,
  is_active
FROM task_types 
WHERE name = 'animate_character';

-- Log confirmation
SELECT 'Added animate_character task type with generation category for trigger processing' as status;

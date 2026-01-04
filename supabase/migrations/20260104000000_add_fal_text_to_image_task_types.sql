-- Add fal.ai text-to-image task types for Qwen and Z Image models
-- These are text-only image generation tasks (no image-to-image)
-- Params: prompt, resolution, seed, loras, additional_loras, negative_prompt

-- qwen_image: Qwen Image (fal.ai)
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
  tool_type,
  content_type,
  is_active
) VALUES (
  'qwen_image',
  'api',
  'generation',
  'Qwen Image',
  'Generate images using Qwen Image model via fal.ai',
  'per_unit',
  0.039,                                          -- $0.03 * 1.3x markup
  0.000001,
  '{}',
  'image-generation',
  'image',
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- qwen_image_2512: Qwen Image 2512 resolution (fal.ai)
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
  tool_type,
  content_type,
  is_active
) VALUES (
  'qwen_image_2512',
  'api',
  'generation',
  'Qwen Image 2512',
  'Generate high-resolution (2512) images using Qwen Image model via fal.ai',
  'per_unit',
  0.026,                                          -- $0.02 * 1.3x markup
  0.000001,
  '{}',
  'image-generation',
  'image',
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- z_image_turbo: Z Image Turbo (fal.ai)
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
  tool_type,
  content_type,
  is_active
) VALUES (
  'z_image_turbo',
  'api',
  'generation',
  'Z Image Turbo',
  'Fast image generation using Z Image Turbo model via fal.ai',
  'per_unit',
  0.0065,                                         -- $0.005 * 1.3x markup
  0.000001,
  '{}',
  'image-generation',
  'image',
  true
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Verify task types were added
SELECT name, category, run_type, billing_type, unit_cost, tool_type, content_type, is_active
FROM task_types
WHERE name IN ('qwen_image', 'qwen_image_2512', 'z_image_turbo');

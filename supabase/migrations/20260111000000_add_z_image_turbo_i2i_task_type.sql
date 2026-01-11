-- Add z_image_turbo_i2i task type for image-to-image generation
-- Uses fal-ai/z-image/turbo/image-to-image endpoint
-- Automatically switches to /lora endpoint when LoRAs are provided
-- Params: image_url, prompt, strength, loras, enable_prompt_expansion, seed, num_images

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
  'z_image_turbo_i2i',
  'api',
  'generation',
  'Z Image Turbo I2I',
  'Image-to-image generation using Z Image Turbo model via fal.ai. Supports LoRAs and prompt expansion.',
  'per_unit',
  0.0065,                                         -- Same cost as z_image_turbo ($0.005 * 1.3x markup)
  0.000001,
  '{}',
  'edit-images',                                  -- Maps to edit-images tool
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

-- Verify task type was added
SELECT name, category, run_type, billing_type, unit_cost, tool_type, content_type, is_active
FROM task_types
WHERE name = 'z_image_turbo_i2i';


-- Add image-inpaint task type to task_types table
-- This enables inpainting tasks where users can paint masks on images
-- and generate new content in the masked areas

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
  'image_inpaint',
  'api',
  'processing',
  'Image Inpaint',
  'Generate new content in masked areas of images using AI',
  0.0,  -- base_cost_per_second is 0 for per_unit billing
  'per_unit',
  0.0020,  -- $0.002 per inpaint operation (slightly more expensive than upscale)
  'processing',
  'image',
  true
)
ON CONFLICT (name) DO NOTHING;

-- Verify the task type was added
SELECT 'image_inpaint task type added to task_types table' as status;


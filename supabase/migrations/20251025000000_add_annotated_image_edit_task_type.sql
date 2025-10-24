-- Add annotated_image_edit task type to task_types table
-- This enables annotation-based image editing where users draw circles/arrows
-- on images and generate new content based on those annotations

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
  'annotated_image_edit',
  'api',
  'processing',
  'Annotated Image Edit',
  'Generate new content based on annotated regions (circles, arrows) on images using AI',
  0.0,  -- base_cost_per_second is 0 for per_unit billing
  'per_unit',
  0.0020,  -- $0.002 per annotated edit operation (same as inpaint)
  'processing',
  'image',
  true
)
ON CONFLICT (name) DO NOTHING;

-- Verify the task type was added
SELECT 'annotated_image_edit task type added to task_types table' as status;


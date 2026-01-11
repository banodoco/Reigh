-- Add UI visibility columns to task_types table
-- This consolidates taskConfig.ts hardcoded values into the database

-- Add the new columns
ALTER TABLE task_types 
ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS supports_progress boolean DEFAULT false;

-- Populate is_visible based on current taskConfig.ts values
-- Default is false (hidden) - we explicitly set visible ones
UPDATE task_types SET is_visible = true WHERE name IN (
  'travel_orchestrator',
  'animate_character',
  'join_clips_orchestrator',
  'individual_travel_segment',
  'edit_video_orchestrator',
  'image_inpaint',
  'qwen_image',
  'qwen_image_2512',
  'z_image_turbo',
  'z_image_turbo_i2i',
  'qwen_image_style',
  'qwen_image_edit'
);

-- Populate supports_progress for orchestrator tasks
UPDATE task_types SET supports_progress = true WHERE name IN (
  'travel_orchestrator',
  'join_clips_orchestrator',
  'edit_video_orchestrator'
);

-- Add comments
COMMENT ON COLUMN task_types.is_visible IS 'Whether this task type should be visible in the TasksPane UI';
COMMENT ON COLUMN task_types.supports_progress IS 'Whether this task type supports progress tracking UI';

-- Create index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_task_types_is_visible ON task_types(is_visible);

-- Verify the updates
SELECT 
    name,
    display_name,
    category,
    is_visible,
    supports_progress,
    is_active
FROM task_types 
WHERE is_active = true
ORDER BY is_visible DESC, category, name;


-- Add join_final_stitch task type for the final stitching step of join clips workflow
-- This task runs after all join_clips_segment tasks complete and stitches their outputs together
-- It depends on multiple predecessor tasks (the segment outputs)

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
  is_active,
  is_visible,
  supports_progress
) VALUES (
  'join_final_stitch',
  'gpu',                                           -- GPU-based stitching (ffmpeg, potential re-encoding)
  'generation',                                    -- Category: generation (creates final output)
  'join-clips',                                    -- Tool type for filtering
  'video',                                         -- Produces video output
  'Join Final Stitch',
  'Final stitching step that combines all join segment outputs into the complete video',
  'per_second',                                    -- Billed per second of output video
  0.000001,                                        -- Minimal unit cost (required field, not used for per_second)
  0.005000,                                        -- Lower cost than generation - mostly concatenation
  '{}'::jsonb,                                     -- No additional cost factors
  true,
  false,                                           -- Not visible in TasksPane (internal orchestration step)
  false                                            -- No progress tracking for stitch task
) ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  run_type = EXCLUDED.run_type,
  unit_cost = EXCLUDED.unit_cost,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  cost_factors = EXCLUDED.cost_factors,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  supports_progress = EXCLUDED.supports_progress,
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
  is_active,
  is_visible,
  supports_progress
FROM task_types
WHERE name = 'join_final_stitch';

-- Log confirmation
SELECT 'Added join_final_stitch task type for final stitching step' as status;

-- Add individual_travel_segment task type for standalone segment regeneration
-- This task type is visible in TasksPane (unlike travel_segment which is hidden as a sub-task)
-- Created from ChildGenerationsView to regenerate individual segments with custom settings

-- =============================================================================
-- 1. Add individual_travel_segment to task_types
-- =============================================================================

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
  'individual_travel_segment',
  'gpu',                                           -- GPU-based video generation
  'generation',                                    -- CRITICAL: 'generation' category for proper processing
  'travel-between-images',                         -- Same tool type as travel_segment
  'video',                                         -- Produces video output
  'Travel Segment',                                -- Display name in TasksPane
  'Individual segment regeneration triggered from segment details view. Creates a variant on the parent generation.',
  'per_second',                                    -- Billed per second of generated video
  0.000001,                                        -- Minimal unit cost (required field)
  0.027800,                                        -- $0.0278 per second (same as travel_segment)
  '{}'::jsonb,                                     -- No additional cost factors
  true                                             -- Active
) ON CONFLICT (name) DO UPDATE SET
  run_type = EXCLUDED.run_type,
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type,
  content_type = EXCLUDED.content_type,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  billing_type = EXCLUDED.billing_type,
  base_cost_per_second = EXCLUDED.base_cost_per_second,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- 2. Also add to task_cost_configs if it exists (for backwards compatibility)
-- =============================================================================

-- Check if task_cost_configs exists before inserting
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'task_cost_configs') THEN
    INSERT INTO task_cost_configs (
      task_type,
      category,
      display_name,
      base_cost_per_second,
      cost_factors,
      is_active
    ) VALUES (
      'individual_travel_segment',
      'generation',
      'Regenerate Segment',
      0.027800,
      '{}'::jsonb,
      true
    ) ON CONFLICT (task_type) DO UPDATE SET
      category = EXCLUDED.category,
      display_name = EXCLUDED.display_name,
      base_cost_per_second = EXCLUDED.base_cost_per_second,
      is_active = EXCLUDED.is_active;
  END IF;
END $$;

-- =============================================================================
-- 3. Add comment for documentation
-- =============================================================================

COMMENT ON COLUMN task_types.name IS 'individual_travel_segment: Standalone segment regeneration visible in TasksPane. Unlike travel_segment (hidden sub-task), this creates variants on existing parent generations.';


-- SQL Verification Script for Per-Pair Parameter Task Payloads
-- This queries the tasks table to find recent travel_orchestrator tasks
-- and verifies that per-pair arrays are present in orchestrator_details

-- Part 1: Find recent travel_orchestrator tasks
SELECT
  t.id,
  t.task_type,
  t.created_at,
  t.project_id,
  -- Check for per-pair arrays in orchestrator_details
  (t.params->'orchestrator_details'->'pair_phase_configs') IS NOT NULL as has_phase_configs,
  (t.params->'orchestrator_details'->'pair_loras') IS NOT NULL as has_loras,
  (t.params->'orchestrator_details'->'pair_motion_settings') IS NOT NULL as has_motion_settings,
  -- Count array lengths
  jsonb_array_length(t.params->'orchestrator_details'->'pair_phase_configs') as phase_configs_count,
  jsonb_array_length(t.params->'orchestrator_details'->'pair_loras') as loras_count,
  jsonb_array_length(t.params->'orchestrator_details'->'pair_motion_settings') as motion_settings_count,
  -- Show orchestrator_details for inspection
  jsonb_pretty(t.params->'orchestrator_details') as orchestrator_details_pretty
FROM tasks t
WHERE
  t.task_type IN ('travel_orchestrator', 'wan_2_2_i2v')
  AND t.created_at > NOW() - INTERVAL '7 days'
ORDER BY t.created_at DESC
LIMIT 10;

-- Part 2: Find tasks with actual per-pair overrides (not all nulls)
SELECT
  t.id,
  t.created_at,
  -- Check for non-null values in arrays
  t.params->'orchestrator_details'->'pair_phase_configs' as phase_configs_array,
  t.params->'orchestrator_details'->'pair_loras' as loras_array,
  t.params->'orchestrator_details'->'pair_motion_settings' as motion_settings_array
FROM tasks t
WHERE
  t.task_type IN ('travel_orchestrator', 'wan_2_2_i2v')
  AND t.created_at > NOW() - INTERVAL '7 days'
  AND (
    -- Has at least one non-null phase_config
    (t.params->'orchestrator_details'->'pair_phase_configs' IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(t.params->'orchestrator_details'->'pair_phase_configs') elem
       WHERE elem IS NOT NULL AND elem::text != 'null'
     ))
    OR
    -- Has at least one non-null lora array
    (t.params->'orchestrator_details'->'pair_loras' IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(t.params->'orchestrator_details'->'pair_loras') elem
       WHERE elem IS NOT NULL AND elem::text != 'null'
     ))
    OR
    -- Has at least one non-null motion setting
    (t.params->'orchestrator_details'->'pair_motion_settings' IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(t.params->'orchestrator_details'->'pair_motion_settings') elem
       WHERE elem IS NOT NULL AND elem::text != 'null'
     ))
  )
ORDER BY t.created_at DESC
LIMIT 5;

-- Part 3: Verify expected payload structure for a specific task
-- (Replace 'TASK_ID_HERE' with actual task ID to inspect)
--
-- SELECT
--   id,
--   task_type,
--   created_at,
--   jsonb_pretty(params->'orchestrator_details') as orchestrator_details,
--   -- Verify shot defaults are present
--   params->'orchestrator_details'->'phase_config' as shot_phase_config,
--   params->'orchestrator_details'->'additional_loras' as shot_loras,
--   -- Verify per-pair arrays
--   params->'orchestrator_details'->'pair_phase_configs' as pair_phase_configs,
--   params->'orchestrator_details'->'pair_loras' as pair_loras,
--   params->'orchestrator_details'->'pair_motion_settings' as pair_motion_settings
-- FROM tasks
-- WHERE id = 'TASK_ID_HERE';

-- Part 4: Summary statistics
SELECT
  'Tasks in last 7 days' as metric,
  COUNT(*) as count
FROM tasks
WHERE task_type IN ('travel_orchestrator', 'wan_2_2_i2v')
  AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Tasks with pair_phase_configs array' as metric,
  COUNT(*) as count
FROM tasks
WHERE task_type IN ('travel_orchestrator', 'wan_2_2_i2v')
  AND created_at > NOW() - INTERVAL '7 days'
  AND params->'orchestrator_details'->'pair_phase_configs' IS NOT NULL

UNION ALL

SELECT
  'Tasks with pair_loras array' as metric,
  COUNT(*) as count
FROM tasks
WHERE task_type IN ('travel_orchestrator', 'wan_2_2_i2v')
  AND created_at > NOW() - INTERVAL '7 days'
  AND params->'orchestrator_details'->'pair_loras' IS NOT NULL

UNION ALL

SELECT
  'Tasks with pair_motion_settings array' as metric,
  COUNT(*) as count
FROM tasks
WHERE task_type IN ('travel_orchestrator', 'wan_2_2_i2v')
  AND created_at > NOW() - INTERVAL '7 days'
  AND params->'orchestrator_details'->'pair_motion_settings' IS NOT NULL;

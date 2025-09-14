-- Manual test queries for PAT-friendly functions
-- Testing user: 8a9fdac5-ed89-482c-aeca-c3dd7922d53c

-- =============================================================================
-- 1. Test user's basic info and constraints
-- =============================================================================

SELECT 
  u.id as user_id,
  u.credits,
  u.given_credits,
  COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
  COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
  u.settings->'ui'->'generationMethods' as generation_methods_settings
FROM users u 
WHERE u.id = '8a9fdac5-ed89-482c-aeca-c3dd7922d53c';

-- =============================================================================
-- 2. Check user's raw tasks (all statuses)
-- =============================================================================

SELECT 
  t.id,
  t.task_type,
  t.status,
  t.created_at,
  t.dependant_on,
  CASE WHEN t.dependant_on IS NOT NULL THEN dep.status END as dependency_status,
  p.name as project_name,
  -- Check if it's an orchestrator task
  CASE WHEN COALESCE(t.task_type, '') ILIKE '%orchestrator%' THEN 'YES' ELSE 'NO' END as is_orchestrator
FROM tasks t
JOIN projects p ON t.project_id = p.id
LEFT JOIN tasks dep ON dep.id = t.dependant_on
WHERE p.user_id = '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'
ORDER BY t.created_at DESC
LIMIT 10;

-- =============================================================================
-- 3. Check user's in-progress task count (excluding orchestrators)
-- =============================================================================

SELECT 
  COUNT(CASE 
    WHEN t.status = 'In Progress' 
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
    THEN 1 
  END) AS non_orchestrator_in_progress_count,
  COUNT(CASE 
    WHEN t.status = 'In Progress'
    THEN 1 
  END) AS total_in_progress_count,
  COUNT(CASE 
    WHEN t.status = 'Queued'
    THEN 1 
  END) AS total_queued_count
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.user_id = '8a9fdac5-ed89-482c-aeca-c3dd7922d53c';

-- =============================================================================
-- 4. Test OLD function (with constraints) - should return 0
-- =============================================================================

-- Test queued only (include_active=false)
SELECT count_eligible_tasks_user(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  false, 
  'gpu'
) as old_function_queued_only_with_gpu_filter;

SELECT count_eligible_tasks_user(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  false, 
  null
) as old_function_queued_only_no_filter;

-- Test queued + active (include_active=true)
SELECT count_eligible_tasks_user(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  true, 
  'gpu'
) as old_function_queued_plus_active_with_gpu_filter;

SELECT count_eligible_tasks_user(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  true, 
  null
) as old_function_queued_plus_active_no_filter;

-- =============================================================================
-- 5. Test NEW PAT function (without constraints) - should return actual counts
-- =============================================================================

-- Test queued only (include_active=false)
SELECT count_eligible_tasks_user_pat(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  false
) as new_pat_function_queued_only;

-- Test queued + active (include_active=true)
SELECT count_eligible_tasks_user_pat(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  true
) as new_pat_function_queued_plus_active;

-- =============================================================================
-- 6. Test analysis functions
-- =============================================================================

-- Old analysis function (with constraints)
SELECT analyze_task_availability_user(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  true
) as old_analysis_result;

-- New PAT analysis function (without constraints)
SELECT analyze_task_availability_user_pat(
  '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, 
  true
) as new_pat_analysis_result;

-- =============================================================================
-- 7. Check task run types for debugging
-- =============================================================================

SELECT 
  t.task_type,
  get_task_run_type(t.task_type) as computed_run_type,
  COUNT(*) as task_count
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.user_id = '8a9fdac5-ed89-482c-aeca-c3dd7922d53c'
  AND t.status IN ('Queued', 'In Progress')
GROUP BY t.task_type, get_task_run_type(t.task_type)
ORDER BY task_count DESC;

-- =============================================================================
-- 8. Summary comparison query
-- =============================================================================

SELECT 
  'OLD (with constraints)' as function_type,
  count_eligible_tasks_user('8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, false, null) as queued_only,
  count_eligible_tasks_user('8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, true, null) as queued_plus_active
UNION ALL
SELECT 
  'NEW PAT (no constraints)' as function_type,
  count_eligible_tasks_user_pat('8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, false) as queued_only,
  count_eligible_tasks_user_pat('8a9fdac5-ed89-482c-aeca-c3dd7922d53c'::uuid, true) as queued_plus_active;

-- Test Queries for claim_next_task Filtering Conditions
-- Run these against your Supabase database to test the various filters

-- =============================================================================
-- 1. BASIC DATA OVERVIEW
-- =============================================================================

-- Check total counts in each table
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'projects' as table_name, COUNT(*) as count FROM projects  
UNION ALL
SELECT 'tasks' as table_name, COUNT(*) as count FROM tasks
UNION ALL
SELECT 'user_api_tokens' as table_name, COUNT(*) as count FROM user_api_tokens;

-- =============================================================================
-- 2. TASK STATUS BREAKDOWN
-- =============================================================================

-- Check task status distribution
SELECT status, COUNT(*) as count 
FROM tasks 
GROUP BY status 
ORDER BY count DESC;

-- Check tasks by type and status
SELECT task_type, status, COUNT(*) as count
FROM tasks
GROUP BY task_type, status
ORDER BY task_type, status;

-- =============================================================================
-- 3. USER CREDIT ANALYSIS
-- =============================================================================

-- Check user credit distribution
SELECT 
  CASE 
    WHEN credits = 0 THEN '0 credits'
    WHEN credits > 0 AND credits <= 1 THEN '0-1 credits'
    WHEN credits > 1 AND credits <= 5 THEN '1-5 credits'
    WHEN credits > 5 AND credits <= 10 THEN '5-10 credits'
    ELSE '>10 credits'
  END as credit_range,
  COUNT(*) as user_count
FROM users
GROUP BY 
  CASE 
    WHEN credits = 0 THEN '0 credits'
    WHEN credits > 0 AND credits <= 1 THEN '0-1 credits'
    WHEN credits > 1 AND credits <= 5 THEN '1-5 credits'
    WHEN credits > 5 AND credits <= 10 THEN '5-10 credits'
    ELSE '>10 credits'
  END
ORDER BY user_count DESC;

-- Users with no credits who have queued tasks
SELECT 
  u.id as user_id,
  u.credits,
  COUNT(t.id) as queued_tasks
FROM users u
JOIN projects p ON p.user_id = u.id
JOIN tasks t ON t.project_id = p.id
WHERE u.credits <= 0 AND t.status = 'Queued'
GROUP BY u.id, u.credits
ORDER BY queued_tasks DESC;

-- =============================================================================
-- 4. GENERATION METHOD PREFERENCES ANALYSIS
-- =============================================================================

-- Check user generation preferences
SELECT 
  COALESCE(
    (settings->'ui'->'generationMethods'->>'onComputer')::boolean, 
    true
  ) as on_computer,
  COALESCE(
    (settings->'ui'->'generationMethods'->>'inCloud')::boolean, 
    true
  ) as in_cloud,
  COUNT(*) as user_count
FROM users
GROUP BY 
  COALESCE((settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
  COALESCE((settings->'ui'->'generationMethods'->>'inCloud')::boolean, true)
ORDER BY user_count DESC;

-- Users who don't allow cloud processing but have queued tasks
SELECT 
  u.id as user_id,
  u.settings->'ui'->'generationMethods' as generation_methods,
  COUNT(t.id) as queued_tasks
FROM users u
JOIN projects p ON p.user_id = u.id
JOIN tasks t ON t.project_id = p.id
WHERE COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = false
  AND t.status = 'Queued'
GROUP BY u.id, u.settings
ORDER BY queued_tasks DESC;

-- Users who don't allow local processing but have queued tasks
SELECT 
  u.id as user_id,
  u.settings->'ui'->'generationMethods' as generation_methods,
  COUNT(t.id) as queued_tasks
FROM users u
JOIN projects p ON p.user_id = u.id
JOIN tasks t ON t.project_id = p.id
WHERE COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) = false
  AND t.status = 'Queued'
GROUP BY u.id, u.settings
ORDER BY queued_tasks DESC;

-- =============================================================================
-- 5. CONCURRENCY LIMIT ANALYSIS
-- =============================================================================

-- Check users' current in-progress task counts
SELECT 
  u.id as user_id,
  u.credits,
  COUNT(t.id) as in_progress_count,
  CASE WHEN COUNT(t.id) >= 5 THEN 'AT_LIMIT' ELSE 'UNDER_LIMIT' END as status
FROM users u
JOIN projects p ON p.user_id = u.id
LEFT JOIN tasks t ON t.project_id = p.id AND t.status = 'In Progress'
GROUP BY u.id, u.credits
HAVING COUNT(t.id) > 0
ORDER BY in_progress_count DESC;

-- Users at or over the 5-task concurrency limit
SELECT 
  u.id as user_id,
  u.credits,
  COUNT(t.id) as in_progress_count
FROM users u
JOIN projects p ON p.user_id = u.id
JOIN tasks t ON t.project_id = p.id AND t.status = 'In Progress'
GROUP BY u.id, u.credits
HAVING COUNT(t.id) >= 5
ORDER BY in_progress_count DESC;

-- =============================================================================
-- 6. DEPENDENCY ANALYSIS
-- =============================================================================

-- Check tasks with dependencies
SELECT 
  COUNT(*) as total_tasks,
  COUNT(dependant_on) as tasks_with_dependencies,
  COUNT(*) - COUNT(dependant_on) as tasks_without_dependencies
FROM tasks
WHERE status = 'Queued';

-- Tasks with unresolved dependencies
SELECT 
  t.id as task_id,
  t.dependant_on,
  dep.status as dependency_status,
  t.status as task_status
FROM tasks t
JOIN tasks dep ON t.dependant_on = dep.id
WHERE t.status = 'Queued' 
  AND dep.status != 'Complete'
ORDER BY t.created_at;

-- Tasks ready (no dependency or dependency complete)
SELECT 
  t.id as task_id,
  t.task_type,
  t.status,
  t.dependant_on,
  CASE 
    WHEN t.dependant_on IS NULL THEN 'NO_DEPENDENCY'
    WHEN dep.status = 'Complete' THEN 'DEPENDENCY_COMPLETE'
    ELSE 'DEPENDENCY_INCOMPLETE'
  END as dependency_status
FROM tasks t
LEFT JOIN tasks dep ON t.dependant_on = dep.id
WHERE t.status = 'Queued'
  AND (t.dependant_on IS NULL OR dep.status = 'Complete')
ORDER BY t.created_at;

-- =============================================================================
-- 7. COMBINED FILTERING - SERVICE ROLE PATH (CLOUD)
-- =============================================================================

-- Tasks eligible for cloud processing (service role path)
WITH eligible_users AS (
  SELECT 
    u.id as user_id,
    u.credits,
    COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
    COUNT(in_progress.id) as in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress ON in_progress.project_id = p.id AND in_progress.status = 'In Progress'
  WHERE u.credits > 0
    AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
  GROUP BY u.id, u.credits, u.settings
  HAVING COUNT(in_progress.id) < 5
)
SELECT 
  t.id as task_id,
  t.task_type,
  t.created_at,
  eu.user_id,
  eu.credits,
  eu.in_progress_count,
  CASE 
    WHEN t.dependant_on IS NULL THEN 'NO_DEPENDENCY'
    WHEN dep.status = 'Complete' THEN 'DEPENDENCY_COMPLETE'
    ELSE 'DEPENDENCY_INCOMPLETE'
  END as dependency_status
FROM tasks t
JOIN projects p ON t.project_id = p.id
JOIN eligible_users eu ON eu.user_id = p.user_id
LEFT JOIN tasks dep ON t.dependant_on = dep.id
WHERE t.status = 'Queued'
  AND (t.dependant_on IS NULL OR dep.status = 'Complete')
ORDER BY t.created_at
LIMIT 10;

-- =============================================================================
-- 8. COMBINED FILTERING - PAT PATH (LOCAL)
-- =============================================================================

-- Example for a specific user (replace with actual user ID)
-- Tasks eligible for local processing for a specific user
WITH user_projects AS (
  SELECT id FROM projects WHERE user_id = 'REPLACE_WITH_ACTUAL_USER_ID'
),
user_in_progress AS (
  SELECT COUNT(*) as count
  FROM tasks t
  JOIN user_projects up ON t.project_id = up.id
  WHERE t.status = 'In Progress'
)
SELECT 
  t.id as task_id,
  t.task_type,
  t.created_at,
  uip.count as current_in_progress,
  CASE 
    WHEN t.dependant_on IS NULL THEN 'NO_DEPENDENCY'
    WHEN dep.status = 'Complete' THEN 'DEPENDENCY_COMPLETE'
    ELSE 'DEPENDENCY_INCOMPLETE'
  END as dependency_status
FROM tasks t
JOIN user_projects up ON t.project_id = up.id
CROSS JOIN user_in_progress uip
LEFT JOIN tasks dep ON t.dependant_on = dep.id
WHERE t.status = 'Queued'
  AND uip.count < 5
  AND (t.dependant_on IS NULL OR dep.status = 'Complete')
ORDER BY t.created_at
LIMIT 10;

-- =============================================================================
-- 9. PERFORMANCE COMPARISON
-- =============================================================================

-- Show how many database queries the current approach would make
-- vs how many a single optimized query would make
SELECT 
  'Current approach queries per task claim' as metric,
  COUNT(DISTINCT p.user_id) * 4 as estimated_queries -- Each user needs: preferences, credits, concurrency check, dependency check
FROM tasks t
JOIN projects p ON t.project_id = p.id  
WHERE t.status = 'Queued';

SELECT 
  'Optimized approach queries' as metric,
  1 as estimated_queries;

-- =============================================================================
-- 10. API TOKEN ANALYSIS
-- =============================================================================

-- Check user API tokens
SELECT 
  u.id as user_id,
  u.email,
  COUNT(uat.id) as token_count,
  MAX(uat.last_used_at) as last_token_use
FROM users u
LEFT JOIN user_api_tokens uat ON uat.user_id = u.id
GROUP BY u.id, u.email
ORDER BY token_count DESC, last_token_use DESC NULLS LAST;

-- Recent API token usage
SELECT 
  uat.name,
  uat.created_at,
  uat.last_used_at,
  u.email
FROM user_api_tokens uat
JOIN users u ON u.id = uat.user_id
ORDER BY uat.last_used_at DESC NULLS LAST
LIMIT 10;

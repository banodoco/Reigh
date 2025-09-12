-- Debug script to test the count function directly
-- Run this to see what the function is actually returning

-- Test the main function with detailed breakdown
WITH per_user_capacity AS (
  SELECT 
    u.id AS user_id,
    u.credits,
    COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
    -- Count all in-progress tasks for concurrency checks (should exclude orchestrator)
    COUNT(CASE 
      WHEN t.status = 'In Progress' 
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1 
    END) AS in_progress_count,
    -- Count ALL in-progress tasks (including orchestrator) for comparison
    COUNT(CASE 
      WHEN t.status = 'In Progress'
      THEN 1 
    END) AS all_in_progress_count,
    -- Count ready queued tasks with dependency resolved
    COUNT(CASE 
      WHEN t.status = 'Queued'
        AND (t.dependant_on IS NULL OR dep.status = 'Complete')
      THEN 1 
    END) AS ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON dep.id = t.dependant_on
  WHERE u.credits > 0
  GROUP BY u.id, u.credits, u.settings
)
SELECT 
  user_id,
  credits,
  in_progress_count,
  all_in_progress_count,
  ready_queued_count,
  -- What the function would return with include_active=true
  LEAST(5, in_progress_count + ready_queued_count) as capacity_with_active,
  -- What the function would return with include_active=false  
  GREATEST(0, LEAST(5 - in_progress_count, ready_queued_count)) as capacity_without_active
FROM per_user_capacity
WHERE in_progress_count > 0 OR ready_queued_count > 0
ORDER BY (in_progress_count + ready_queued_count) DESC
LIMIT 10;

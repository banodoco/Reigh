-- Final fix for count_eligible_tasks_service_role to ensure orchestrator exclusion
-- This migration ensures the 2-parameter version with orchestrator exclusion is used
-- and removes any conflicting 1-parameter versions

-- Drop any existing versions to avoid conflicts
DROP FUNCTION IF EXISTS count_eligible_tasks_service_role(BOOLEAN);
DROP FUNCTION IF EXISTS count_eligible_tasks_service_role(BOOLEAN, TEXT);

-- Create the definitive 2-parameter version with orchestrator exclusion
CREATE OR REPLACE FUNCTION public.count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_capacity INTEGER := 0;
BEGIN
  -- Calculate per-user capacity and sum across all eligible users
  WITH per_user_capacity AS (
    SELECT 
      u.id AS user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      -- Count non-orchestrator in-progress tasks for concurrency checks
      COUNT(CASE 
        WHEN t.status = 'In Progress' 
          AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
        THEN 1 
      END) AS in_progress_count,
      -- Count ready queued tasks with dependency resolved and optional run_type filter
      COUNT(CASE 
        WHEN t.status = 'Queued'
          AND (t.dependant_on IS NULL OR dep.status = 'Complete')
          AND (
            p_run_type IS NULL -- include all when no filter
            OR get_task_run_type(t.task_type) = p_run_type
          )
        THEN 1 
      END) AS ready_queued_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON dep.id = t.dependant_on
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COALESCE(COUNT(CASE 
      WHEN t.status = 'In Progress' 
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1 
    END), 0) < 5
  )
  SELECT COALESCE(SUM(
    CASE 
      WHEN p_include_active THEN
        -- Capacity including active: cap at 5 per user
        LEAST(5, in_progress_count + ready_queued_count)
      ELSE
        -- Capacity for new claims only
        GREATEST(0, LEAST(5 - in_progress_count, ready_queued_count))
    END
  ), 0) INTO v_total_capacity
  FROM per_user_capacity;

  RETURN v_total_capacity;
END;
$$;

COMMENT ON FUNCTION public.count_eligible_tasks_service_role(BOOLEAN, TEXT) IS
'FINAL VERSION: Returns capacity-limited task counts across eligible users; respects run_type and dependency resolution. Excludes orchestrator tasks from In Progress counts for capacity calculations. include_active=true counts current in-progress toward capacity.';

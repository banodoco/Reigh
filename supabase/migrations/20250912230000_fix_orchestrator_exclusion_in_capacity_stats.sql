-- Fix per_user_capacity_stats_service_role to exclude orchestrator tasks
-- This ensures consistency with the main counting functions that exclude orchestrator tasks
-- from capacity calculations

CREATE OR REPLACE FUNCTION per_user_capacity_stats_service_role()
RETURNS TABLE(
  user_id UUID,
  credits NUMERIC,
  queued_tasks BIGINT,
  in_progress_tasks BIGINT,
  total_pending_tasks BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.credits,
    COALESCE(queued.task_count, 0) as queued_tasks,
    COALESCE(in_progress.task_count, 0) as in_progress_tasks,
    COALESCE(queued.task_count, 0) + COALESCE(in_progress.task_count, 0) as total_pending_tasks
  FROM users u
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Queued'
    GROUP BY p.user_id
  ) queued ON u.id = queued.user_id
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'In Progress'
      -- Exclude orchestrator tasks from capacity calculations for consistency
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
    GROUP BY p.user_id
  ) in_progress ON u.id = in_progress.user_id
  WHERE u.credits IS NOT NULL
  ORDER BY total_pending_tasks DESC, u.credits DESC;
END;
$$;

COMMENT ON FUNCTION per_user_capacity_stats_service_role IS 'Returns per-user task statistics excluding orchestrator tasks from in_progress counts to maintain consistency with capacity calculations.';

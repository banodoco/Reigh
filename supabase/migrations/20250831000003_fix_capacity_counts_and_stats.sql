-- Fix capacity counts to use cloud-only active tasks for stability
-- Also fix per_user_capacity_stats_service_role ambiguity and ensure reliable output

-- Update: count_eligible_tasks_service_role to use cloud-only active
CREATE OR REPLACE FUNCTION public.count_eligible_tasks_service_role(
  p_include_active boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total integer := 0;
BEGIN
  WITH per_user AS (
    SELECT 
      u.id AS user_id,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      u.credits AS credits,
      -- Cloud-only, non-orchestrator active tasks
      COUNT(CASE WHEN t.status = 'In Progress' AND t.worker_id IS NOT NULL AND COALESCE(t.task_type,'') NOT ILIKE '%orchestrator%' THEN 1 END) AS cloud_active,
      -- Ready queued tasks (deps resolved)
      COUNT(CASE WHEN t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete') THEN 1 END) AS ready_queued
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.settings, u.credits
  )
  SELECT COALESCE(SUM(
    CASE 
      WHEN p_include_active THEN LEAST(5, cloud_active + ready_queued)
      ELSE GREATEST(0, LEAST(5 - cloud_active, ready_queued))
    END
  ), 0) INTO v_total
  FROM per_user;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.count_eligible_tasks_service_role(boolean) IS 'Capacity-limited counts using cloud-only active (worker_id set, non-orchestrator). include_active=false returns claimable capacity; include_active=true returns cloud_active + queued capacity per user, capped at 5.';

-- Fix: per_user_capacity_stats_service_role ambiguity and columns
CREATE OR REPLACE FUNCTION public.per_user_capacity_stats_service_role()
RETURNS TABLE (
  uid uuid,
  credits numeric,
  queued_tasks integer,
  cloud_active integer,
  allows_cloud boolean,
  at_limit boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH per_user AS (
    SELECT 
      u.id AS uid,
      u.credits AS credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      COUNT(CASE WHEN t.status = 'In Progress' AND t.worker_id IS NOT NULL AND COALESCE(t.task_type,'') NOT ILIKE '%orchestrator%' THEN 1 END) AS cloud_active,
      COUNT(CASE WHEN t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete') THEN 1 END) AS queued_tasks
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE u.credits > 0
    GROUP BY u.id, u.credits, u.settings
  )
  SELECT 
    per_user.uid,
    per_user.credits,
    per_user.queued_tasks,
    per_user.cloud_active,
    per_user.allows_cloud,
    (per_user.cloud_active >= 5) AS at_limit
  FROM per_user
  WHERE per_user.allows_cloud = true;
END;
$$;

COMMENT ON FUNCTION public.per_user_capacity_stats_service_role IS 'Per-user queued (deps resolved) and cloud-only active (non-orchestrator) with credits and allows_cloud flags for debugging.';

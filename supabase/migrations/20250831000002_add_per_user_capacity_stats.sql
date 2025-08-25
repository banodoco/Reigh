-- Always-on per-user capacity stats for service-role count mode
-- Returns per-user queued (deps resolved), in-progress (cloud), credits, allows_cloud, and at_limit flag

CREATE OR REPLACE FUNCTION public.per_user_capacity_stats_service_role()
RETURNS TABLE (
  user_id uuid,
  credits numeric,
  queued_tasks integer,
  in_progress_tasks integer,
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
      u.id AS user_id,
      u.credits AS credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      COUNT(CASE WHEN t.status = 'In Progress' AND t.worker_id IS NOT NULL THEN 1 END) AS in_progress_tasks,
      COUNT(CASE 
        WHEN t.status = 'Queued' AND (
          t.dependant_on IS NULL OR dep.status = 'Complete'
        ) THEN 1 
      END) AS queued_tasks
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE u.credits > 0
    GROUP BY u.id, u.credits, u.settings
  )
  SELECT 
    user_id,
    credits,
    queued_tasks,
    in_progress_tasks,
    allows_cloud,
    (in_progress_tasks >= 5) AS at_limit
  FROM per_user
  WHERE allows_cloud = true;
END;
$$;

COMMENT ON FUNCTION public.per_user_capacity_stats_service_role IS 'Returns per-user queued (deps resolved), cloud in-progress, credits, allows_cloud and at_limit for service-role debugging.';

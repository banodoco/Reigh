-- Fix count_eligible_tasks_service_role parameter scope issue
-- The p_include_active parameter cannot be referenced inside WITH clause

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
      COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) AS in_progress_count,
      COUNT(CASE 
        WHEN t.status = 'Queued' AND (
          t.dependant_on IS NULL OR dep.status = 'Complete'
        ) THEN 1 
      END) AS ready_queued_count
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
      WHEN p_include_active THEN 
        LEAST(5, in_progress_count + ready_queued_count)
      ELSE 
        GREATEST(0, LEAST(5 - in_progress_count, ready_queued_count))
    END
  ), 0) INTO v_total
  FROM per_user;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.count_eligible_tasks_service_role(boolean) IS 'Capacity-limited counts: include_active=false returns claimable capacity; include_active=true returns total capacity (in_progress + queued) per user, capped at 5.';

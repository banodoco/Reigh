-- Fix dry-run counting for service-role to avoid over-counting active tasks
-- When include_active=true, only count In Progress tasks that:
--   1) are cloud-claimed (worker_id IS NOT NULL), and
--   2) belong to eligible users (credits > 0, inCloud enabled, and <5 in-progress)

CREATE OR REPLACE FUNCTION count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_queued_count INTEGER;
  v_active_count INTEGER;
BEGIN
  -- Count eligible QUEUED tasks (with all filters applied)
  WITH eligible_users AS (
    SELECT 
      u.id as user_id
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  )
  SELECT COUNT(*)
  INTO v_queued_count
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  JOIN eligible_users eu ON eu.user_id = p.user_id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE t.status = 'Queued'
    AND (t.dependant_on IS NULL OR dep.status = 'Complete');

  IF p_include_active THEN
    -- Count only cloud-claimed In Progress tasks FOR ELIGIBLE USERS
    WITH eligible_users AS (
      SELECT 
        u.id as user_id
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
        AND in_progress_tasks.status = 'In Progress'
      WHERE u.credits > 0
        AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
      GROUP BY u.id, u.credits, u.settings
      HAVING COUNT(in_progress_tasks.id) < 5
    )
    SELECT COUNT(*)
    INTO v_active_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN eligible_users eu ON eu.user_id = p.user_id
    WHERE t.status = 'In Progress'
      AND t.worker_id IS NOT NULL; -- cloud-claimed only
    
    v_count := v_queued_count + v_active_count;
  ELSE
    v_count := v_queued_count;
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Counts eligible queued tasks for service role; if include_active=true, adds only cloud-claimed In Progress tasks for eligible users.';



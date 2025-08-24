-- Exclude orchestrator tasks from In Progress counts in dry-run mode
-- Applies only to the active portion added when include_active=true; does not
-- change eligibility filtering or capacity checks.

-- =============================================================================
-- Update: count_eligible_tasks_service_role
-- =============================================================================

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
    -- Only count cloud-claimed In Progress tasks FOR ELIGIBLE USERS,
    -- excluding orchestrator tasks from the active portion
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
      AND t.worker_id IS NOT NULL
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%';
    
    v_count := v_queued_count + v_active_count;
  ELSE
    v_count := v_queued_count;
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Counts eligible queued tasks for service role; if include_active=true, adds only cloud-claimed In Progress tasks for eligible users, excluding orchestrator tasks from the active portion.';

-- =============================================================================
-- Update: count_eligible_tasks_user  
-- =============================================================================

CREATE OR REPLACE FUNCTION count_eligible_tasks_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
  v_queued_count INTEGER;
BEGIN
  -- Aggregate per-user counts; exclude orchestrator tasks from the active
  -- portion when include_active=true, but keep full in-progress counts when
  -- computing capacity for queued-only mode.
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE 
      WHEN t.status = 'In Progress' AND (
        NOT p_include_active OR 
        COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      ) THEN 1 
    END) AS in_progress_count,
    COUNT(CASE WHEN t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete') THEN 1 END) AS queued_count
  INTO v_allows_local, v_user_credits, v_in_progress_count, v_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  IF NOT v_allows_local OR v_user_credits <= 0 THEN
    RETURN 0;
  END IF;

  IF p_include_active THEN
    RETURN LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_queued_count, 0));
  ELSE
    RETURN GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_queued_count, 0)));
  END IF;
END;
$$;

COMMENT ON FUNCTION count_eligible_tasks_user IS 'Counts tasks for a user with per-user cap of 5 total (Queued + In Progress). When include_active=true, adds In Progress tasks excluding orchestrators.';

-- Enforce eligibility and capacity limits in count functions, with run_type support
-- - Service role: sums capacity across eligible users (credits > 0, inCloud enabled, <5 in-progress)
-- - User: returns capacity for a specific user (onComputer enabled, credits > 0, <5 in-progress)
-- - Ready queued requires dependency resolved
-- - run_type filtering via task_types (respects is_active)
-- - No SECURITY DEFINER to align with recent RLS policy decisions

-- =============================================================================
-- count_eligible_tasks_service_role(p_include_active, p_run_type)
-- =============================================================================

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
      -- Count all in-progress tasks for concurrency checks (cloud/local both count toward the 5-task cap)
      COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) AS in_progress_count,
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
    HAVING COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) < 5
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
'Returns capacity-limited task counts across eligible users; respects run_type and dependency resolution. include_active=true counts current in-progress toward capacity.';

-- =============================================================================
-- count_eligible_tasks_user(p_user_id, p_include_active, p_run_type)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_eligible_tasks_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
  v_ready_queued_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Aggregate per-user eligibility and counts
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) AS in_progress_count,
    COUNT(CASE 
      WHEN t.status = 'Queued'
        AND (t.dependant_on IS NULL OR dep.status = 'Complete')
        AND (
          p_run_type IS NULL
          OR get_task_run_type(t.task_type) = p_run_type
        )
      THEN 1 
    END) AS ready_queued_count
  INTO v_allows_local, v_user_credits, v_in_progress_count, v_ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON dep.id = t.dependant_on
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  -- Eligibility checks
  IF NOT v_allows_local OR v_user_credits <= 0 OR COALESCE(v_in_progress_count, 0) >= 5 THEN
    RETURN 0;
  END IF;

  -- Capacity calculation
  IF p_include_active THEN
    v_capacity := LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_ready_queued_count, 0));
  ELSE
    v_capacity := GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_ready_queued_count, 0)));
  END IF;

  RETURN v_capacity;
END;
$$;

COMMENT ON FUNCTION public.count_eligible_tasks_user(UUID, BOOLEAN, TEXT) IS
'Returns capacity-limited task counts for a user; respects run_type and dependency resolution. include_active=true counts current in-progress toward capacity.';



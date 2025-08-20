-- Cap dry-run counting to at most 5 tasks per user (Queued + In Progress combined)
-- This aligns monitoring counts with the concurrency cap and avoids inflating totals

-- Service role: counts across all users who allow cloud and have credits
CREATE OR REPLACE FUNCTION count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH per_user AS (
    SELECT 
      u.id AS user_id,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      u.credits AS credits,
      -- Total In Progress for this user (any worker)
      COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) AS in_progress_count,
      -- Eligible queued tasks for this user (deps resolved)
      COUNT(CASE WHEN t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete') THEN 1 END) AS queued_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    GROUP BY u.id, u.settings, u.credits
  )
  SELECT COALESCE(SUM(
    CASE 
      WHEN credits > 0 AND allows_cloud AND in_progress_count < 5 THEN
        CASE 
          WHEN p_include_active THEN LEAST(5, in_progress_count + queued_count)
          ELSE GREATEST(0, LEAST(5 - in_progress_count, queued_count))
        END
      ELSE 0
    END
  ), 0) INTO v_count
  FROM per_user;

  RETURN v_count;
END;
$$;

-- User-specific: counts within a single user's scope and preferences
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
  -- Aggregate per-user counts
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) AS in_progress_count,
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

COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Counts tasks with per-user cap of 5 total (Queued + In Progress). include_active includes In Progress in the capped total.';
COMMENT ON FUNCTION count_eligible_tasks_user IS 'Counts tasks for a user with per-user cap of 5 total (Queued + In Progress). include_active includes In Progress in the capped total.';



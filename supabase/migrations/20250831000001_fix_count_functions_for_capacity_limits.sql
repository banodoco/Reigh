-- Fix count functions to return capacity-limited counts instead of total eligible tasks
-- This aligns counting with actual claiming capacity considering per-user limits

-- =============================================================================
-- Update: count_eligible_tasks_service_role - capacity-limited version
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_total_capacity INTEGER := 0;
BEGIN
  -- Calculate per-user capacity and sum across all eligible users
  WITH per_user_capacity AS (
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as in_progress_count,
      COUNT(CASE 
        WHEN t.status = 'Queued' AND (
          t.dependant_on IS NULL OR dep.status = 'Complete'
        ) THEN 1 
      END) as ready_queued_count,
      COUNT(CASE 
        WHEN t.status = 'In Progress' 
          AND t.worker_id IS NOT NULL 
          AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
        THEN 1 
      END) as cloud_active_non_orch_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) < 5
  )
  SELECT COALESCE(SUM(
    CASE 
      WHEN p_include_active THEN
        -- Capacity for queued + current active (capped at 5 total per user)
        LEAST(5, in_progress_count + ready_queued_count)
      ELSE
        -- Capacity for new queued tasks only (respecting current in-progress)
        GREATEST(0, LEAST(5 - in_progress_count, ready_queued_count))
    END
  ), 0) INTO v_total_capacity
  FROM per_user_capacity;

  RETURN v_total_capacity;
END;
$$;

COMMENT ON FUNCTION "public"."count_eligible_tasks_service_role"("p_include_active" boolean) IS 'Returns capacity-limited task counts for service role. Respects per-user 5-task limit: if include_active=false returns claimable capacity, if true returns total capacity including active tasks.';

-- =============================================================================
-- Update: count_eligible_tasks_user - capacity-limited version  
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
  v_ready_queued_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Get user eligibility and task counts
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as in_progress_count,
    COUNT(CASE 
      WHEN t.status = 'Queued' AND (
        t.dependant_on IS NULL OR dep.status = 'Complete'
      ) THEN 1 
    END) as ready_queued_count
  INTO v_allows_local, v_user_credits, v_in_progress_count, v_ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  -- Check basic eligibility
  IF NOT v_allows_local OR v_user_credits <= 0 OR v_in_progress_count >= 5 THEN
    RETURN 0;
  END IF;

  -- Calculate capacity based on mode
  IF p_include_active THEN
    -- Total capacity: current in-progress + ready queued (capped at 5)
    -- For user mode, we include all in-progress (not just non-orchestrator)
    v_capacity := LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_ready_queued_count, 0));
  ELSE
    -- Claimable capacity: how many new tasks can be claimed right now
    v_capacity := GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_ready_queued_count, 0)));
  END IF;

  RETURN v_capacity;
END;
$$;

COMMENT ON FUNCTION "public"."count_eligible_tasks_user"("p_user_id" "uuid", "p_include_active" boolean) IS 'Returns capacity-limited task counts for a specific user. Respects 5-task limit: if include_active=false returns claimable capacity, if true returns total capacity including in-progress tasks.';

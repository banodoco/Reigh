-- =============================================================================
-- Migration: Add Task Count Breakdown for Scaling Decisions
-- =============================================================================
-- Provides detailed breakdown of queued tasks by blocking reason:
-- - claimable_now: Tasks that can be claimed immediately
-- - blocked_by_capacity: Tasks blocked only by user's 5-task limit (will free up)
-- - blocked_by_deps: Tasks blocked by incomplete dependencies
-- - blocked_by_settings: Tasks blocked because user has cloud disabled
--
-- This enables smarter scaling decisions:
-- - claimable_now → Scale up immediately
-- - blocked_by_capacity → Keep workers warm (these WILL become claimable)
-- - blocked_by_deps → Maybe scale, depends on dependency age
-- - blocked_by_settings → Ignore (user choice, won't become claimable)
-- =============================================================================

BEGIN;

-- =============================================================================
-- New RPC: count_queued_tasks_breakdown_service_role
-- =============================================================================
-- Returns a breakdown of queued tasks by their blocking reason.
-- Used by orchestrators for smarter scaling decisions.

CREATE OR REPLACE FUNCTION count_queued_tasks_breakdown_service_role(
  p_run_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  claimable_now INTEGER,
  blocked_by_capacity INTEGER,
  blocked_by_deps INTEGER,
  blocked_by_settings INTEGER,
  total_queued INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_capacity AS (
    -- Calculate each user's current in-progress count (excluding orchestrators)
    SELECT
      u.id AS user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) AS allows_cloud,
      COUNT(t.id) FILTER (
        WHERE t.status = 'In Progress'::task_status
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      ) AS in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE u.credits > 0
    GROUP BY u.id, u.credits, u.settings
  ),
  categorized_tasks AS (
    -- Categorize each queued task by its blocking reason
    SELECT
      t.id AS task_id,
      uc.user_id,
      uc.credits,
      uc.allows_cloud,
      uc.in_progress_count,
      all_dependencies_complete(t.dependant_on) AS deps_complete,
      CASE
        -- No credits = excluded entirely (not counted)
        WHEN uc.credits IS NULL OR uc.credits <= 0 THEN 'excluded'
        -- Cloud disabled = blocked by settings
        WHEN NOT uc.allows_cloud THEN 'blocked_by_settings'
        -- Dependencies not complete = blocked by deps
        WHEN NOT all_dependencies_complete(t.dependant_on) THEN 'blocked_by_deps'
        -- User at capacity (5+ in progress) = blocked by capacity
        WHEN uc.in_progress_count >= 5 THEN 'blocked_by_capacity'
        -- Otherwise claimable
        ELSE 'claimable_now'
      END AS category
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN user_capacity uc ON uc.user_id = p.user_id
    WHERE t.status = 'Queued'::task_status
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      AND (
        p_run_type IS NULL
        OR get_task_run_type(t.task_type) = p_run_type
      )
  )
  SELECT
    COUNT(*) FILTER (WHERE category = 'claimable_now')::INTEGER AS claimable_now,
    COUNT(*) FILTER (WHERE category = 'blocked_by_capacity')::INTEGER AS blocked_by_capacity,
    COUNT(*) FILTER (WHERE category = 'blocked_by_deps')::INTEGER AS blocked_by_deps,
    COUNT(*) FILTER (WHERE category = 'blocked_by_settings')::INTEGER AS blocked_by_settings,
    COUNT(*) FILTER (WHERE category != 'excluded')::INTEGER AS total_queued
  FROM categorized_tasks;
END;
$$;

COMMENT ON FUNCTION count_queued_tasks_breakdown_service_role(TEXT) IS
'Returns breakdown of queued tasks by blocking reason for smarter scaling decisions.
claimable_now: immediately claimable. blocked_by_capacity: will free up as tasks complete.
blocked_by_deps: waiting on dependencies. blocked_by_settings: user has cloud disabled.';

COMMIT;

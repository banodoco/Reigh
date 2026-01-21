-- =============================================================================
-- Migration: Support Multiple Task Dependencies
-- =============================================================================
-- Changes dependant_on from uuid (single) to uuid[] (array)
-- A task is eligible when ALL dependencies are complete.
--
-- Backward compatible:
-- - NULL remains NULL (no dependencies)
-- - Existing single UUIDs become single-element arrays
-- - API accepts both single value and array (normalized in edge function)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ALTER COLUMN TYPE: uuid -> uuid[]
-- =============================================================================

-- Convert existing data: single uuid -> array containing that uuid
ALTER TABLE tasks
ALTER COLUMN dependant_on TYPE uuid[]
USING CASE
  WHEN dependant_on IS NULL THEN NULL
  ELSE ARRAY[dependant_on]
END;

-- Update index for array queries (GIN index is optimal for array containment)
DROP INDEX IF EXISTS idx_dependant_on;
DROP INDEX IF EXISTS idx_tasks_dependant_on;
CREATE INDEX idx_tasks_dependant_on ON tasks USING GIN (dependant_on) WHERE dependant_on IS NOT NULL;

-- =============================================================================
-- 1b. DROP functions with potential signature conflicts
-- =============================================================================
-- Some functions have changed return types or columns over migrations.
-- We drop them first to avoid "cannot change return type" errors.

DROP FUNCTION IF EXISTS per_user_capacity_stats_service_role();
-- Note: analyze_task_availability_service_role is dropped in section 7 below

-- =============================================================================
-- 2. HELPER FUNCTION: Check if all dependencies are complete
-- =============================================================================
-- Returns TRUE if task has no dependencies OR all dependencies are complete
-- This is the single source of truth for dependency eligibility checks

CREATE OR REPLACE FUNCTION all_dependencies_complete(p_dependant_on uuid[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_dependant_on IS NULL
    OR CARDINALITY(p_dependant_on) = 0
    OR NOT EXISTS (
      -- Check if any dependency is NOT complete
      SELECT 1
      FROM unnest(p_dependant_on) AS dep_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM tasks dep
        WHERE dep.id = dep_id
        AND dep.status = 'Complete'::task_status
      )
    )
$$;

COMMENT ON FUNCTION all_dependencies_complete(uuid[]) IS
'Returns TRUE if the task has no dependencies or ALL dependencies are complete. Used for task eligibility checks.';

-- =============================================================================
-- 3. UPDATE claim_next_task_service_role
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_next_task_service_role(
  p_worker_id TEXT,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL,
  p_same_model_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  task_id UUID,
  params JSONB,
  task_type TEXT,
  project_id UUID,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_user_id UUID;
  v_status_filter task_status[];
  v_worker_model TEXT;
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Get worker's current model for affinity matching
  SELECT current_model INTO v_worker_model
  FROM workers
  WHERE id = p_worker_id AND status = 'active';

  -- Single atomic query to find and claim the next eligible task
  WITH eligible_users AS (
    SELECT
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id
      AND in_progress_tasks.status = 'In Progress'::task_status
      AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    SELECT
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN v_worker_model IS NOT NULL
                 AND get_task_model(t.params) = v_worker_model
            THEN 0
            ELSE 1
          END,
          t.created_at ASC
      ) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Queued'::task_status
      -- NEW: Use helper function for array dependency check
      AND all_dependencies_complete(t.dependant_on)
      AND EXISTS (
        SELECT 1 FROM eligible_users eu WHERE eu.user_id = p.user_id
      )
      AND (
        p_run_type IS NULL OR
        get_task_run_type(t.task_type) = p_run_type
      )
      AND (
        NOT p_same_model_only
        OR v_worker_model IS NULL
        OR get_task_model(t.params) = v_worker_model
      )
  )
  UPDATE tasks
  SET
    status = CASE
      WHEN status = 'Queued'::task_status THEN 'In Progress'::task_status
      ELSE status
    END,
    worker_id = CASE
      WHEN status = 'Queued'::task_status THEN p_worker_id
      ELSE worker_id
    END,
    updated_at = CASE
      WHEN status = 'Queued'::task_status THEN NOW()
      ELSE updated_at
    END,
    generation_started_at = CASE
      WHEN status = 'Queued'::task_status THEN NOW()
      ELSE generation_started_at
    END
  FROM ready_tasks rt
  WHERE tasks.id = rt.id
    AND rt.rn = 1
    AND (NOT p_include_active OR tasks.status = 'Queued'::task_status)
  RETURNING
    tasks.id,
    tasks.params,
    tasks.task_type,
    tasks.project_id,
    rt.user_id
  INTO v_task_id, v_params, v_task_type, v_project_id, v_user_id;

  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    user_id := v_user_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- =============================================================================
-- 4. UPDATE claim_next_task_user_pat
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_next_task_user_pat(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  task_id UUID,
  params JSONB,
  task_type TEXT,
  project_id UUID,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_user_id UUID;
  v_status_filter task_status[];
BEGIN
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  WITH eligible_user_check AS (
    SELECT
      u.id as user_id,
      u.credits,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id
      AND in_progress_tasks.status = 'In Progress'::task_status
      AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'
    WHERE u.id = p_user_id
      AND u.credits > 0
    GROUP BY u.id, u.credits
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    SELECT
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Queued'::task_status
      AND p.user_id = p_user_id
      -- NEW: Use helper function for array dependency check
      AND all_dependencies_complete(t.dependant_on)
      AND EXISTS (
        SELECT 1 FROM eligible_user_check
      )
      AND (
        p_run_type IS NULL OR
        get_task_run_type(t.task_type) = p_run_type
      )
  )
  UPDATE tasks
  SET
    status = CASE
      WHEN status = 'Queued'::task_status THEN 'In Progress'::task_status
      ELSE status
    END,
    updated_at = CASE
      WHEN status = 'Queued'::task_status THEN NOW()
      ELSE updated_at
    END,
    generation_started_at = CASE
      WHEN status = 'Queued'::task_status THEN NOW()
      ELSE generation_started_at
    END
  FROM ready_tasks rt
  WHERE tasks.id = rt.id
    AND rt.rn = 1
    AND (NOT p_include_active OR tasks.status = 'Queued'::task_status)
  RETURNING
    tasks.id,
    tasks.params,
    tasks.task_type,
    tasks.project_id,
    rt.user_id
  INTO v_task_id, v_params, v_task_type, v_project_id, v_user_id;

  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    user_id := v_user_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- =============================================================================
-- 5. UPDATE count_eligible_tasks_service_role
-- =============================================================================
-- Matches pattern from 20250912001000_enforce_eligibility_in_count_functions.sql
-- Uses capacity-based calculations with LEAST/GREATEST per user

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
      -- Count all in-progress tasks for concurrency checks (excludes orchestrators)
      COUNT(CASE
        WHEN t.status = 'In Progress'
          AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
        THEN 1
      END) AS in_progress_count,
      -- Count ready queued tasks using helper function for array dependency check
      COUNT(CASE
        WHEN t.status = 'Queued'
          AND all_dependencies_complete(t.dependant_on)
          AND (
            p_run_type IS NULL
            OR get_task_run_type(t.task_type) = p_run_type
          )
        THEN 1
      END) AS ready_queued_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COALESCE(COUNT(CASE
      WHEN t.status = 'In Progress'
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1
    END), 0) < 5
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

-- =============================================================================
-- 6. UPDATE count_eligible_tasks_user_pat
-- =============================================================================

CREATE OR REPLACE FUNCTION count_eligible_tasks_user_pat(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM (
    SELECT t.id
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE
      p.user_id = p_user_id
      AND CASE
        WHEN p_include_active THEN t.status IN ('Queued'::task_status, 'In Progress'::task_status)
        ELSE t.status = 'Queued'::task_status
      END
      -- NEW: Use helper function for array dependency check
      AND all_dependencies_complete(t.dependant_on)
      AND u.credits > 0
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      AND (
        SELECT COUNT(*)
        FROM tasks t2
        JOIN projects p2 ON t2.project_id = p2.id
        WHERE p2.user_id = p_user_id
        AND t2.status = 'In Progress'::task_status
        AND COALESCE(t2.task_type, '') NOT ILIKE '%orchestrator%'
      ) < 5
  ) eligible_tasks;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- 7. UPDATE analyze_task_availability_service_role
-- =============================================================================
-- Drop first because return type changed (TABLE -> JSONB)
DROP FUNCTION IF EXISTS analyze_task_availability_service_role(BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION analyze_task_availability_service_role(
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH task_analysis AS (
    SELECT
      t.id,
      t.status,
      t.task_type,
      p.user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      t.dependant_on,
      -- NEW: Use helper function
      all_dependencies_complete(t.dependant_on) as deps_complete,
      CASE
        WHEN u.credits <= 0 THEN 'no_credits'
        WHEN COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = false THEN 'cloud_disabled'
        WHEN NOT all_dependencies_complete(t.dependant_on) THEN 'dependency_blocked'
        ELSE 'eligible'
      END as rejection_reason
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE
      CASE
        WHEN p_include_active THEN t.status IN ('Queued'::task_status, 'In Progress'::task_status)
        ELSE t.status = 'Queued'::task_status
      END
      AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
  )
  SELECT jsonb_build_object(
    'total_tasks', (SELECT COUNT(*) FROM task_analysis),
    'eligible_tasks', (SELECT COUNT(*) FROM task_analysis WHERE rejection_reason = 'eligible'),
    'rejection_reasons', jsonb_build_object(
      'no_credits', (SELECT COUNT(*) FROM task_analysis WHERE rejection_reason = 'no_credits'),
      'cloud_disabled', (SELECT COUNT(*) FROM task_analysis WHERE rejection_reason = 'cloud_disabled'),
      'dependency_blocked', (SELECT COUNT(*) FROM task_analysis WHERE rejection_reason = 'dependency_blocked')
    ),
    'user_stats', (
      SELECT COALESCE(jsonb_agg(user_stat), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'user_id', user_id,
          'credits', MAX(credits),
          'allows_cloud', bool_and(allows_cloud),
          'queued_tasks', COUNT(*) FILTER (WHERE status = 'Queued'::task_status),
          'in_progress_tasks', COUNT(*) FILTER (WHERE status = 'In Progress'::task_status)
        ) as user_stat
        FROM task_analysis
        GROUP BY user_id
      ) user_stats
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 8. UPDATE analyze_task_availability_user_pat
-- =============================================================================

CREATE OR REPLACE FUNCTION analyze_task_availability_user_pat(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_user_info JSONB;
  v_eligible_count INTEGER;
  v_projects JSONB;
  v_recent_tasks JSONB;
BEGIN
  -- Get user info
  SELECT jsonb_build_object(
    'credits', u.credits,
    'allows_local', true,
    'settings', u.settings
  )
  INTO v_user_info
  FROM users u
  WHERE u.id = p_user_id;

  -- Count eligible tasks
  SELECT COUNT(*)::INTEGER INTO v_eligible_count
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  WHERE p.user_id = p_user_id
    AND t.status = 'Queued'::task_status
    -- NEW: Use helper function
    AND all_dependencies_complete(t.dependant_on)
    AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%';

  -- Get projects
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
  INTO v_projects
  FROM projects p
  WHERE p.user_id = p_user_id;

  -- Get recent tasks with dependency info
  SELECT COALESCE(jsonb_agg(task_info ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_recent_tasks
  FROM (
    SELECT
      jsonb_build_object(
        'id', t.id,
        'task_type', t.task_type,
        'status', t.status,
        'created_at', t.created_at,
        'dependant_on', t.dependant_on,
        'has_dependency', t.dependant_on IS NOT NULL AND CARDINALITY(t.dependant_on) > 0,
        'deps_complete', all_dependencies_complete(t.dependant_on),
        'dependency_blocking', t.dependant_on IS NOT NULL AND CARDINALITY(t.dependant_on) > 0 AND NOT all_dependencies_complete(t.dependant_on)
      ) as task_info,
      t.created_at
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE p.user_id = p_user_id
      AND t.status IN ('Queued'::task_status, 'In Progress'::task_status)
    LIMIT 20
  ) recent;

  RETURN jsonb_build_object(
    'user_info', v_user_info,
    'eligible_count', v_eligible_count,
    'projects', v_projects,
    'recent_tasks', v_recent_tasks
  );
END;
$$;

-- =============================================================================
-- 9. UPDATE per_user_capacity_stats_service_role
-- =============================================================================

CREATE OR REPLACE FUNCTION per_user_capacity_stats_service_role()
RETURNS TABLE(
  user_id UUID,
  credits NUMERIC,
  queued_tasks BIGINT,
  in_progress_tasks BIGINT,
  allows_cloud BOOLEAN,
  at_limit BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id as user_id,
    u.credits,
    -- NEW: Use helper function for dependency check in queued count
    COUNT(CASE
      WHEN t.status = 'Queued'::task_status
           AND all_dependencies_complete(t.dependant_on)
           AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1
    END) AS queued_tasks,
    COUNT(CASE
      WHEN t.status = 'In Progress'::task_status
           AND t.worker_id IS NOT NULL
           AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1
    END) AS in_progress_tasks,
    COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
    COUNT(CASE
      WHEN t.status = 'In Progress'::task_status
           AND t.worker_id IS NOT NULL
           AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1
    END) >= 5 AS at_limit
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  WHERE u.credits > 0
  GROUP BY u.id, u.credits, u.settings;
END;
$$;

-- =============================================================================
-- 10. UPDATE claim_next_task_user (non-PAT version)
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_next_task_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  task_id UUID,
  params JSONB,
  task_type TEXT,
  project_id UUID,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_user_id UUID;
  v_status_filter task_status[];
BEGIN
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  WITH eligible_user_check AS (
    SELECT
      u.id as user_id,
      u.credits,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id
      AND in_progress_tasks.status = 'In Progress'::task_status
      AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'
    WHERE u.id = p_user_id
      AND u.credits > 0
    GROUP BY u.id, u.credits
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    SELECT
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Queued'::task_status
      AND p.user_id = p_user_id
      -- NEW: Use helper function for array dependency check
      AND all_dependencies_complete(t.dependant_on)
      AND EXISTS (
        SELECT 1 FROM eligible_user_check
      )
      AND (
        p_run_type IS NULL OR
        get_task_run_type(t.task_type) = p_run_type
      )
  )
  UPDATE tasks
  SET
    status = CASE
      WHEN status = 'Queued'::task_status THEN 'In Progress'::task_status
      ELSE status
    END,
    updated_at = CASE
      WHEN status = 'Queued'::task_status THEN NOW()
      ELSE updated_at
    END,
    generation_started_at = CASE
      WHEN status = 'Queued'::task_status THEN NOW()
      ELSE generation_started_at
    END
  FROM ready_tasks rt
  WHERE tasks.id = rt.id
    AND rt.rn = 1
    AND (NOT p_include_active OR tasks.status = 'Queued'::task_status)
  RETURNING
    tasks.id,
    tasks.params,
    tasks.task_type,
    tasks.project_id,
    rt.user_id
  INTO v_task_id, v_params, v_task_type, v_project_id, v_user_id;

  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    user_id := v_user_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- =============================================================================
-- 11. UPDATE count_eligible_tasks_user (non-PAT version with run_type)
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
  -- Exclude orchestrator tasks from In Progress counts for capacity calculations
  SELECT
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE
      WHEN t.status = 'In Progress'
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1
    END) AS in_progress_count,
    -- NEW: Use helper function for array dependency check
    COUNT(CASE
      WHEN t.status = 'Queued'
        AND all_dependencies_complete(t.dependant_on)
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
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  -- Eligibility checks (using non-orchestrator In Progress count)
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

-- =============================================================================
-- 12. UPDATE analyze_task_availability_user (non-PAT version)
-- =============================================================================

CREATE OR REPLACE FUNCTION analyze_task_availability_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_user_info JSONB;
  v_projects JSONB;
  v_tasks JSONB;
BEGIN
  -- Get user information
  SELECT jsonb_build_object(
    'user_id', u.id,
    'credits', u.credits,
    'allows_local', COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    'allows_cloud', COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true)
  )
  INTO v_user_info
  FROM users u
  WHERE u.id = p_user_id;

  -- Get user's projects
  SELECT jsonb_agg(
    jsonb_build_object(
      'project_id', p.id,
      'name', p.name,
      'created_at', p.created_at
    )
  )
  INTO v_projects
  FROM projects p
  WHERE p.user_id = p_user_id;

  -- Get user's tasks with array dependency info
  WITH user_tasks AS (
    SELECT
      t.id,
      t.task_type,
      t.status,
      t.created_at,
      t.dependant_on,
      -- NEW: Use helper function and show dependency count
      all_dependencies_complete(t.dependant_on) as deps_complete,
      CARDINALITY(t.dependant_on) as dependency_count,
      p.name as project_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE p.user_id = p_user_id
      AND ((p_include_active AND t.status IN ('Queued'::task_status, 'In Progress'::task_status))
           OR (NOT p_include_active AND t.status = 'Queued'::task_status))
    ORDER BY t.created_at DESC
    LIMIT 10
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', id,
      'task_type', task_type,
      'status', status,
      'created_at', created_at,
      'project_name', project_name,
      'has_dependency', dependant_on IS NOT NULL AND CARDINALITY(dependant_on) > 0,
      'dependency_count', COALESCE(dependency_count, 0),
      'deps_complete', deps_complete,
      'dependency_blocking', dependant_on IS NOT NULL AND CARDINALITY(dependant_on) > 0 AND NOT deps_complete
    )
  )
  INTO v_tasks
  FROM user_tasks;

  -- Build result
  v_result := jsonb_build_object(
    'user_info', COALESCE(v_user_info, '{}'),
    'projects', COALESCE(v_projects, '[]'),
    'recent_tasks', COALESCE(v_tasks, '[]'),
    'eligible_count', count_eligible_tasks_user(p_user_id, p_include_active)
  );

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 13. Add comments
-- =============================================================================

COMMENT ON FUNCTION claim_next_task_service_role(TEXT, BOOLEAN, TEXT, BOOLEAN) IS
'Claims next eligible task for service role. Supports multiple dependencies (all must be complete). Prioritizes model affinity. Excludes orchestrators from concurrency limit.';

COMMENT ON FUNCTION claim_next_task_user(UUID, BOOLEAN, TEXT) IS
'Claims next eligible task for user (non-PAT). Supports multiple dependencies (all must be complete). Uses FIFO ordering. Excludes orchestrators from concurrency limit.';

COMMENT ON FUNCTION claim_next_task_user_pat(UUID, BOOLEAN, TEXT) IS
'Claims next eligible task for user (PAT). Supports multiple dependencies (all must be complete). Uses FIFO ordering. Excludes orchestrators from concurrency limit.';

COMMENT ON FUNCTION count_eligible_tasks_service_role(BOOLEAN, TEXT) IS
'Counts eligible tasks for service role. Supports multiple dependencies.';

COMMENT ON FUNCTION count_eligible_tasks_user(UUID, BOOLEAN, TEXT) IS
'Counts eligible tasks for user (non-PAT). Supports multiple dependencies.';

COMMENT ON FUNCTION count_eligible_tasks_user_pat(UUID, BOOLEAN) IS
'Counts eligible tasks for user (PAT). Supports multiple dependencies.';

COMMENT ON FUNCTION analyze_task_availability_user(UUID, BOOLEAN) IS
'Provides detailed analysis of task availability for a specific user. Supports multiple dependencies.';

COMMIT;

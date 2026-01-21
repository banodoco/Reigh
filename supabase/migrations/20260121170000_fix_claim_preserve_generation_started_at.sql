-- Fix claim functions to preserve generation_started_at if already set
-- Previously, re-claiming an orchestrator task would reset generation_started_at to NOW()
-- This caused billing calculations to use the wrong start time

BEGIN;

-- Fix service role version
DROP FUNCTION IF EXISTS claim_next_task_service_role(TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION claim_next_task_service_role(
  p_worker_id TEXT,
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
BEGIN
  RETURN QUERY
  WITH eligible_task AS (
    SELECT
      t.id,
      t.params as task_params,
      t.task_type,
      t.project_id,
      p.user_id
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN task_types tt ON t.task_type = tt.name
    JOIN users u ON p.user_id = u.id
    WHERE t.status = 'Queued'::task_status
      AND tt.is_active = true
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
      AND (
        SELECT COUNT(*)
        FROM tasks t2
        JOIN projects p2 ON t2.project_id = p2.id
        WHERE p2.user_id = u.id AND t2.status = 'In Progress'::task_status
      ) < 5
      AND (
        t.dependant_on IS NULL
        OR EXISTS (
          SELECT 1 FROM tasks dep
          WHERE dep.id = t.dependant_on
          AND dep.status = 'Complete'::task_status
        )
      )
    ORDER BY t.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE tasks
  SET
    status = 'In Progress'::task_status,
    worker_id = p_worker_id,
    -- Only set generation_started_at if not already set (preserves original start time)
    generation_started_at = COALESCE(tasks.generation_started_at, NOW()),
    updated_at = NOW()
  FROM eligible_task et
  WHERE tasks.id = et.id
  RETURNING
    et.id,
    et.task_params,
    et.task_type,
    et.project_id,
    et.user_id;
END;
$$;

-- Fix user version
DROP FUNCTION IF EXISTS claim_next_task_user(UUID, BOOLEAN, TEXT);

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
BEGIN
  RETURN QUERY
  WITH eligible_task AS (
    SELECT
      t.id,
      t.params as task_params,
      t.task_type,
      t.project_id,
      p.user_id
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN task_types tt ON t.task_type = tt.name
    JOIN users u ON p.user_id = u.id
    WHERE t.status = 'Queued'::task_status
      AND p.user_id = p_user_id
      AND tt.is_active = true
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND u.credits > 0
      AND (
        SELECT COUNT(*)
        FROM tasks t2
        JOIN projects p2 ON t2.project_id = p2.id
        WHERE p2.user_id = u.id AND t2.status = 'In Progress'::task_status
      ) < 5
      AND (
        t.dependant_on IS NULL
        OR EXISTS (
          SELECT 1 FROM tasks dep
          WHERE dep.id = t.dependant_on
          AND dep.status = 'Complete'::task_status
        )
      )
    ORDER BY t.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE tasks
  SET
    status = 'In Progress'::task_status,
    -- Only set generation_started_at if not already set (preserves original start time)
    generation_started_at = COALESCE(tasks.generation_started_at, NOW()),
    updated_at = NOW()
  FROM eligible_task et
  WHERE tasks.id = et.id
  RETURNING
    et.id,
    et.task_params,
    et.task_type,
    et.project_id,
    et.user_id;
END;
$$;

COMMIT;

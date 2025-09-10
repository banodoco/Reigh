-- Fix the ambiguous params column reference in claim functions
-- The issue is that we have both a variable and a column named "params"

BEGIN;

-- Drop and recreate with proper variable naming to avoid ambiguity
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
  -- Simple direct query without CTEs to avoid variable conflicts
  -- This is a simplified version that avoids the params ambiguity
  RETURN QUERY
  WITH eligible_task AS (
    SELECT 
      t.id,
      t.params as task_params,  -- Alias to avoid ambiguity
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
      -- Check user capacity
      AND (
        SELECT COUNT(*) 
        FROM tasks t2 
        JOIN projects p2 ON t2.project_id = p2.id 
        WHERE p2.user_id = u.id AND t2.status = 'In Progress'::task_status
      ) < 5
      -- Check dependencies
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
    generation_started_at = NOW(),
    updated_at = NOW()
  FROM eligible_task et
  WHERE tasks.id = et.id
  RETURNING 
    et.id,
    et.task_params,  -- Use the aliased column
    et.task_type,
    et.project_id,
    et.user_id;
END;
$$;

-- Also fix the user version
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
  -- Simple direct query for user-specific tasks
  RETURN QUERY
  WITH eligible_task AS (
    SELECT 
      t.id,
      t.params as task_params,  -- Alias to avoid ambiguity
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
      -- Check user capacity
      AND (
        SELECT COUNT(*) 
        FROM tasks t2 
        JOIN projects p2 ON t2.project_id = p2.id 
        WHERE p2.user_id = u.id AND t2.status = 'In Progress'::task_status
      ) < 5
      -- Check dependencies
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
    generation_started_at = NOW(),
    updated_at = NOW()
  FROM eligible_task et
  WHERE tasks.id = et.id
  RETURNING 
    et.id,
    et.task_params,  -- Use the aliased column
    et.task_type,
    et.project_id,
    et.user_id;
END;
$$;

COMMIT;

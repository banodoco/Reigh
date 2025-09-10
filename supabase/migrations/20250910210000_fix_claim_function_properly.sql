-- Fix the claim functions with the EXACT original working definitions
-- The previous revert migration had the wrong function structure

BEGIN;

-- Drop the broken functions
DROP FUNCTION IF EXISTS claim_next_task_service_role(TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS claim_next_task_user(UUID, BOOLEAN, TEXT);

-- Restore the EXACT working claim_next_task_service_role from 20250903000002
CREATE OR REPLACE FUNCTION claim_next_task_service_role(
  p_worker_id TEXT,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL  -- New parameter: 'gpu', 'api', or NULL (no filtering)
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
  -- Set status filter based on include_active flag (with proper enum casting)
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Single atomic query to find and claim the next eligible task
  WITH eligible_users AS (
    -- Pre-filter users who meet all criteria
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'::task_status
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    -- Find tasks that meet dependency criteria and run_type filter
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
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'::task_status
      AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status)
      AND EXISTS (
        SELECT 1 FROM eligible_users eu WHERE eu.user_id = p.user_id
      )
      -- Add run_type filtering if specified
      AND (
        p_run_type IS NULL OR 
        get_task_run_type(t.task_type) = p_run_type
      )
  ),
  active_tasks AS (
    -- For include_active mode: count all In Progress tasks (with run_type filter if specified)
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      999 as rn  -- High number so they don't get claimed
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE p_include_active AND t.status = 'In Progress'::task_status
      -- Add run_type filtering if specified
      AND (
        p_run_type IS NULL OR 
        get_task_run_type(t.task_type) = p_run_type
      )
  ),
  combined_tasks AS (
    SELECT * FROM ready_tasks
    UNION ALL
    SELECT * FROM active_tasks
  )
  -- Atomically claim the first eligible task
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
    generation_started_at = CASE 
      WHEN status = 'Queued'::task_status THEN NOW() 
      ELSE generation_started_at 
    END,
    updated_at = NOW()
  WHERE id = (
    SELECT id FROM combined_tasks WHERE rn = 1 LIMIT 1
  )
  RETURNING id, params, task_type, project_id, 
    (SELECT user_id FROM combined_tasks WHERE combined_tasks.id = tasks.id);
END;
$$;

-- Restore the EXACT working claim_next_task_user from 20250903000002
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
  v_status_filter task_status[];
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Pre-check user eligibility
  IF NOT EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'::task_status
    WHERE u.id = p_user_id
      AND u.credits > 0
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ) THEN
    RETURN; -- User not eligible, return empty result
  END IF;

  -- Find and claim next eligible task for this specific user
  WITH ready_tasks AS (
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
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'::task_status
      AND p.user_id = p_user_id
      AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status)
      -- Add run_type filtering if specified
      AND (
        p_run_type IS NULL OR 
        get_task_run_type(t.task_type) = p_run_type
      )
  ),
  active_tasks AS (
    -- For include_active mode: count user's In Progress tasks (with run_type filter if specified)
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      p.user_id,
      999 as rn  -- High number so they don't get claimed
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE p_include_active 
      AND p.user_id = p_user_id
      AND t.status = 'In Progress'::task_status
      -- Add run_type filtering if specified
      AND (
        p_run_type IS NULL OR 
        get_task_run_type(t.task_type) = p_run_type
      )
  ),
  combined_tasks AS (
    SELECT * FROM ready_tasks
    UNION ALL
    SELECT * FROM active_tasks
  )
  -- Atomically claim the first eligible task
  UPDATE tasks 
  SET 
    status = CASE 
      WHEN status = 'Queued'::task_status THEN 'In Progress'::task_status 
      ELSE status 
    END,
    generation_started_at = CASE 
      WHEN status = 'Queued'::task_status THEN NOW() 
      ELSE generation_started_at 
    END,
    updated_at = NOW()
  WHERE id = (
    SELECT id FROM combined_tasks WHERE rn = 1 LIMIT 1
  )
  RETURNING id, params, task_type, project_id, p_user_id;
END;
$$;

COMMIT;

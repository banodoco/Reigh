-- Remove SECURITY DEFINER from claim functions and update RLS policies to allow proper functioning
-- This allows the functions to work without elevated privileges by adjusting RLS policies

BEGIN;

-- First, update RLS policies to allow task claiming without SECURITY DEFINER

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Allow task claiming for queued tasks" ON tasks;
DROP POLICY IF EXISTS "Allow viewing queued tasks for claiming" ON tasks;
DROP POLICY IF EXISTS "Allow viewing own project tasks" ON tasks;

-- Add policy to allow authenticated users to claim queued tasks (for cross-user claiming)
CREATE POLICY "Allow task claiming for queued tasks" ON tasks
  FOR UPDATE
  TO authenticated
  USING (status = 'Queued'::task_status)
  WITH CHECK (status IN ('Queued'::task_status, 'In Progress'::task_status));

-- Add policy to allow authenticated users to see queued tasks for claiming purposes
CREATE POLICY "Allow viewing queued tasks for claiming" ON tasks
  FOR SELECT
  TO authenticated
  USING (status = 'Queued'::task_status OR status = 'In Progress'::task_status);

-- Add policy to allow users to see their own project tasks (needed for user eligibility checks)
CREATE POLICY "Allow viewing own project tasks" ON tasks
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p WHERE p.user_id = auth.uid()
    )
  );

-- Now remove SECURITY DEFINER from claim_next_task_service_role
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
-- REMOVED SECURITY DEFINER - function now runs with caller's privileges
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

  -- Return the claimed task or nothing if no task was available
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

-- Also remove SECURITY DEFINER from claim_next_task_user if it exists
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
-- REMOVED SECURITY DEFINER - function now runs with caller's privileges
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
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
  RETURNING tasks.id, tasks.params, tasks.task_type, tasks.project_id, p_user_id
  INTO v_task_id, v_params, v_task_type, v_project_id;

  -- Return the claimed task or nothing if no task was available
  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    user_id := p_user_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- Add comments explaining the changes
COMMENT ON FUNCTION claim_next_task_service_role IS 
'Removed SECURITY DEFINER - now relies on RLS policies to allow cross-user task claiming for authenticated users';

COMMENT ON FUNCTION claim_next_task_user IS 
'Removed SECURITY DEFINER - now runs with caller privileges and relies on RLS policies';

COMMIT;

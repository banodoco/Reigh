-- Fix claim_next_task_service_role to exclude orchestrators from concurrency limit
-- This aligns with count_eligible_tasks_service_role which already excludes orchestrators
--
-- Issue: claim function was counting ALL in-progress tasks toward the 5-task limit,
-- while count function excluded orchestrators. This caused discrepancies where
-- count would show tasks as claimable but claim would reject them.

BEGIN;

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
    -- IMPORTANT: Exclude orchestrators from in-progress count to match count function
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'::task_status
      AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'  -- EXCLUDE orchestrators
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

-- Also update the user version for consistency
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
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Single atomic query to find and claim the next eligible task for this user
  WITH eligible_user_check AS (
    -- Check if user meets criteria (excluding orchestrators from in-progress count)
    SELECT 
      u.id as user_id,
      u.credits,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'::task_status
      AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'  -- EXCLUDE orchestrators
    WHERE u.id = p_user_id
      AND u.credits > 0
    GROUP BY u.id, u.credits
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    -- Find tasks for this user that meet dependency criteria and run_type filter
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
      AND EXISTS (
        SELECT 1 FROM eligible_user_check
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

COMMENT ON FUNCTION claim_next_task_service_role IS 
'Claims next eligible task for service role. Excludes orchestrator tasks from the 5-task concurrency limit to match count function behavior.';

COMMENT ON FUNCTION claim_next_task_user IS 
'Claims next eligible task for user. Excludes orchestrator tasks from the 5-task concurrency limit to match count function behavior.';

COMMIT;


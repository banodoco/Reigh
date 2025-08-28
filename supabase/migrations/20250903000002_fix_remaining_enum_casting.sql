-- Fix ALL remaining task_status enum casting issues in claim functions
-- The previous fix only addressed some of the issues

-- =============================================================================
-- 1. Fix SERVICE ROLE function with ALL proper enum casting
-- =============================================================================

DROP FUNCTION IF EXISTS claim_next_task_service_role(TEXT, BOOLEAN, TEXT);

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
      AND in_progress_tasks.status = 'In Progress'::task_status  -- ✅ Fixed
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
    WHERE t.status = 'Queued'::task_status  -- ✅ Fixed
      AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status)  -- ✅ Fixed
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
    WHERE p_include_active AND t.status = 'In Progress'::task_status  -- ✅ Fixed
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
    AND (NOT p_include_active OR tasks.status = 'Queued'::task_status) -- ✅ Fixed
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

-- =============================================================================
-- 2. Fix USER TOKEN function with ALL proper enum casting  
-- =============================================================================

DROP FUNCTION IF EXISTS claim_next_task_user(UUID, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION claim_next_task_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL  -- New parameter: 'gpu', 'api', or NULL (no filtering)
)
RETURNS TABLE(
  task_id UUID,
  params JSONB,
  task_type TEXT,
  project_id UUID
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
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
BEGIN
  -- Set status filter based on include_active flag (with proper enum casting)
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Get user preferences and validate eligibility
  SELECT 
    u.credits,
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    COUNT(in_progress_tasks.id)
  INTO v_user_credits, v_allows_local, v_in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
    AND in_progress_tasks.status = 'In Progress'::task_status  -- ✅ Fixed
  WHERE u.id = p_user_id
  GROUP BY u.id, u.credits, u.settings;

  -- Early exit if user doesn't meet basic criteria
  IF NOT v_allows_local OR v_user_credits <= 0 OR v_in_progress_count >= 5 THEN
    RETURN;
  END IF;

  -- Single atomic query to find and claim the next eligible task for this user
  WITH user_projects AS (
    SELECT id FROM projects WHERE user_id = p_user_id
  ),
  ready_tasks AS (
    -- Find tasks that meet dependency criteria and run_type filter for this user
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN user_projects up ON t.project_id = up.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = ANY(v_status_filter)
      AND (
        -- For include_active mode, In Progress tasks are already claimed
        (p_include_active AND t.status = 'In Progress'::task_status) OR  -- ✅ Fixed
        -- For normal mode, only claim Queued tasks with resolved dependencies
        (t.status = 'Queued'::task_status AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status))  -- ✅ Fixed
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
    AND (NOT p_include_active OR tasks.status = 'Queued'::task_status) -- ✅ Fixed
  RETURNING 
    tasks.id,
    tasks.params,
    tasks.task_type,
    tasks.project_id
  INTO v_task_id, v_params, v_task_type, v_project_id;

  -- Return the claimed task or nothing if no task was available
  IF v_task_id IS NOT NULL THEN
    task_id := v_task_id;
    params := v_params;
    task_type := v_task_type;
    project_id := v_project_id;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- Update function comments
COMMENT ON FUNCTION claim_next_task_service_role IS 'Optimized function to atomically claim next eligible task for service role (cloud processing) with optional run_type filtering and complete enum casting fixes';
COMMENT ON FUNCTION claim_next_task_user IS 'Optimized function to atomically claim next eligible task for specific user (local processing) with optional run_type filtering and complete enum casting fixes';

-- Fix the include_active logic to match original functionality
-- The original include_active mode is for COUNTING/MONITORING, not claiming

-- =============================================================================
-- CORRECTED SERVICE ROLE FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_next_task_service_role(
  p_worker_id TEXT,
  p_include_active BOOLEAN DEFAULT FALSE
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
BEGIN
  -- NOTE: include_active is for COUNTING ONLY in dry_run mode
  -- In actual claiming mode, we ALWAYS only claim Queued tasks
  -- include_active just affects what gets counted in dry_run

  -- Single atomic query to find and claim the next eligible QUEUED task
  WITH eligible_users AS (
    -- Pre-filter users who meet all criteria for NEW task claiming
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(in_progress_tasks.id) as in_progress_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    -- Find QUEUED tasks that meet all dependency and user criteria
    SELECT 
      t.id,
      t.params,
      t.task_type,
      t.project_id,
      t.created_at,
      eu.user_id,
      ROW_NUMBER() OVER (ORDER BY t.created_at ASC) as rn
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN eligible_users eu ON eu.user_id = p.user_id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete')
  )
  -- Atomically claim the first eligible QUEUED task
  UPDATE tasks 
  SET 
    status = 'In Progress'::task_status,
    worker_id = p_worker_id,
    updated_at = NOW(),
    generation_started_at = NOW()
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND tasks.status = 'Queued'  -- Double-check it's still queued
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
-- CORRECTED USER FUNCTION  
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_next_task_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
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
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
BEGIN
  -- NOTE: include_active is for COUNTING ONLY in dry_run mode
  -- In actual claiming mode, we ALWAYS only claim Queued tasks

  -- Get user preferences and validate eligibility
  SELECT 
    u.credits,
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    COUNT(in_progress_tasks.id)
  INTO v_user_credits, v_allows_local, v_in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
    AND in_progress_tasks.status = 'In Progress'
  WHERE u.id = p_user_id
  GROUP BY u.id, u.credits, u.settings;

  -- Early exit if user doesn't meet basic criteria
  IF NOT v_allows_local OR v_user_credits <= 0 OR v_in_progress_count >= 5 THEN
    RETURN;
  END IF;

  -- Single atomic query to find and claim the next eligible QUEUED task for this user
  WITH user_projects AS (
    SELECT id FROM projects WHERE user_id = p_user_id
  ),
  ready_tasks AS (
    -- Find QUEUED tasks that meet dependency criteria for this user
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
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete')
  )
  -- Atomically claim the first eligible QUEUED task
  UPDATE tasks 
  SET 
    status = 'In Progress'::task_status,
    updated_at = NOW(),
    generation_started_at = NOW()
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND tasks.status = 'Queued'  -- Double-check it's still queued
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

-- =============================================================================
-- CORRECTED COUNT FUNCTIONS (These handle include_active properly)
-- =============================================================================

CREATE OR REPLACE FUNCTION count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_queued_count INTEGER;
  v_active_count INTEGER;
BEGIN
  -- Count eligible QUEUED tasks (with all filters applied)
  WITH eligible_users AS (
    SELECT 
      u.id as user_id
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
      AND in_progress_tasks.status = 'In Progress'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  )
  SELECT COUNT(*)
  INTO v_queued_count
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  JOIN eligible_users eu ON eu.user_id = p.user_id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE t.status = 'Queued'
    AND (t.dependant_on IS NULL OR dep.status = 'Complete');

  IF p_include_active THEN
    -- Count ALL In Progress tasks (no filtering - just like original)
    SELECT COUNT(*)
    INTO v_active_count
    FROM tasks
    WHERE status = 'In Progress';
    
    v_count := v_queued_count + v_active_count;
  ELSE
    v_count := v_queued_count;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION count_eligible_tasks_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_queued_count INTEGER;
  v_active_count INTEGER;
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
BEGIN
  -- Get user preferences and validate eligibility
  SELECT 
    u.credits,
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    COUNT(in_progress_tasks.id)
  INTO v_user_credits, v_allows_local, v_in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
    AND in_progress_tasks.status = 'In Progress'
  WHERE u.id = p_user_id
  GROUP BY u.id, u.credits, u.settings;

  -- Count eligible QUEUED tasks for this user (with all filters applied)
  IF v_allows_local AND v_user_credits > 0 AND v_in_progress_count < 5 THEN
    WITH user_projects AS (
      SELECT id FROM projects WHERE user_id = p_user_id
    )
    SELECT COUNT(*)
    INTO v_queued_count
    FROM tasks t
    JOIN user_projects up ON t.project_id = up.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete');
  ELSE
    v_queued_count := 0;
  END IF;

  IF p_include_active THEN
    -- Count ALL In Progress tasks for this user (no filtering - just like original)
    WITH user_projects AS (
      SELECT id FROM projects WHERE user_id = p_user_id
    )
    SELECT COUNT(*)
    INTO v_active_count
    FROM tasks t
    JOIN user_projects up ON t.project_id = up.id
    WHERE t.status = 'In Progress';
    
    v_count := v_queued_count + v_active_count;
  ELSE
    v_count := v_queued_count;
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION claim_next_task_service_role IS 'Claims next eligible QUEUED task for service role. include_active only affects dry_run counting.';
COMMENT ON FUNCTION claim_next_task_user IS 'Claims next eligible QUEUED task for user. include_active only affects dry_run counting.';
COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Counts eligible tasks. If include_active=true, adds ALL In Progress tasks (no filtering).';
COMMENT ON FUNCTION count_eligible_tasks_user IS 'Counts eligible tasks for user. If include_active=true, adds ALL user In Progress tasks (no filtering).';

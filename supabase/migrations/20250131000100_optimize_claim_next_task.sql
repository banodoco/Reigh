-- Optimize claim_next_task with single-query approach
-- This migration creates optimized functions for both service role and user token paths

-- =============================================================================
-- 1. SERVICE ROLE PATH: Claim tasks from any user (cloud processing)
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
  v_status_filter TEXT[];
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued', 'In Progress'];
  ELSE
    v_status_filter := ARRAY['Queued'];
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
      AND in_progress_tasks.status = 'In Progress'
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(in_progress_tasks.id) < 5
  ),
  ready_tasks AS (
    -- Find tasks that meet dependency criteria
    -- NOTE: include_active mode is for COUNTING only, not claiming
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
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete')
      AND EXISTS (
        SELECT 1 FROM eligible_users eu WHERE eu.user_id = p.user_id
      )
  ),
  active_tasks AS (
    -- For include_active mode: count all In Progress tasks (no filtering)
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
    WHERE p_include_active AND t.status = 'In Progress'
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
      WHEN status = 'Queued' THEN 'In Progress'::task_status 
      ELSE status 
    END,
    worker_id = CASE 
      WHEN status = 'Queued' THEN p_worker_id 
      ELSE worker_id 
    END,
    updated_at = CASE 
      WHEN status = 'Queued' THEN NOW() 
      ELSE updated_at 
    END,
    generation_started_at = CASE 
      WHEN status = 'Queued' THEN NOW() 
      ELSE generation_started_at 
    END
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND (NOT p_include_active OR tasks.status = 'Queued') -- Only update if it's still claimable
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
-- 2. USER TOKEN PATH: Claim tasks for specific user (local processing)
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
  v_status_filter TEXT[];
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued', 'In Progress'];
  ELSE
    v_status_filter := ARRAY['Queued'];
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
    AND in_progress_tasks.status = 'In Progress'
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
    -- Find tasks that meet dependency criteria for this user
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
        (p_include_active AND t.status = 'In Progress') OR
        -- For normal mode, only claim Queued tasks with resolved dependencies
        (t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete'))
      )
  )
  -- Atomically claim the first eligible task
  UPDATE tasks 
  SET 
    status = CASE 
      WHEN status = 'Queued' THEN 'In Progress'::task_status 
      ELSE status 
    END,
    updated_at = CASE 
      WHEN status = 'Queued' THEN NOW() 
      ELSE updated_at 
    END,
    generation_started_at = CASE 
      WHEN status = 'Queued' THEN NOW() 
      ELSE generation_started_at 
    END
  FROM ready_tasks rt
  WHERE tasks.id = rt.id 
    AND rt.rn = 1
    AND (NOT p_include_active OR tasks.status = 'Queued') -- Only update if it's still claimable
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
-- 3. DRY RUN FUNCTIONS: Count eligible tasks without claiming
-- =============================================================================

CREATE OR REPLACE FUNCTION count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_filter TEXT[];
  v_count INTEGER;
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued', 'In Progress'];
  ELSE
    v_status_filter := ARRAY['Queued'];
  END IF;

  -- Count eligible tasks using same logic as claim function
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
  INTO v_count
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  JOIN eligible_users eu ON eu.user_id = p.user_id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE t.status = ANY(v_status_filter)
    AND (
      (p_include_active AND t.status = 'In Progress') OR
      (t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete'))
    );

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
  v_status_filter TEXT[];
  v_count INTEGER;
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
BEGIN
  -- Set status filter based on include_active flag
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued', 'In Progress'];
  ELSE
    v_status_filter := ARRAY['Queued'];
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
    AND in_progress_tasks.status = 'In Progress'
  WHERE u.id = p_user_id
  GROUP BY u.id, u.credits, u.settings;

  -- Early exit if user doesn't meet basic criteria
  IF NOT v_allows_local OR v_user_credits <= 0 OR v_in_progress_count >= 5 THEN
    RETURN 0;
  END IF;

  -- Count eligible tasks for this user
  WITH user_projects AS (
    SELECT id FROM projects WHERE user_id = p_user_id
  )
  SELECT COUNT(*)
  INTO v_count
  FROM tasks t
  JOIN user_projects up ON t.project_id = up.id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE t.status = ANY(v_status_filter)
    AND (
      (p_include_active AND t.status = 'In Progress') OR
      (t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete'))
    );

  RETURN v_count;
END;
$$;

-- =============================================================================
-- 4. ADD WORKER_ID COLUMN TO TASKS TABLE (if not exists)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'worker_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN worker_id TEXT;
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_worker_id ON tasks(worker_id);
  END IF;
END $$;

-- =============================================================================
-- 5. ADD HELPFUL INDEXES FOR PERFORMANCE
-- =============================================================================

-- Index for task status and dependency lookups
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_dependant_on ON tasks(dependant_on) WHERE dependant_on IS NOT NULL;

-- Index for user settings lookup
CREATE INDEX IF NOT EXISTS idx_users_generation_settings ON users USING GIN ((settings->'ui'->'generationMethods'));

-- Index for project-user relationship
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Composite index for in-progress task counting
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_inprogress ON tasks(project_id, status) WHERE status = 'In Progress';

COMMENT ON FUNCTION claim_next_task_service_role IS 'Optimized function to atomically claim next eligible task for service role (cloud processing)';
COMMENT ON FUNCTION claim_next_task_user IS 'Optimized function to atomically claim next eligible task for specific user (local processing)';
COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Count eligible tasks for service role without claiming (dry run)';
COMMENT ON FUNCTION count_eligible_tasks_user IS 'Count eligible tasks for specific user without claiming (dry run)';

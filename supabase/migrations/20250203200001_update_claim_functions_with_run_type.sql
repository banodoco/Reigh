-- Update claim and count functions to support run_type filtering
-- Adds optional p_run_type parameter to all claim/count functions

-- =============================================================================
-- 1. SERVICE ROLE: Claim tasks with run_type filtering
-- =============================================================================

-- Drop existing function first to avoid signature conflicts
DROP FUNCTION IF EXISTS claim_next_task_service_role(TEXT, BOOLEAN);

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
    WHERE t.status = 'Queued'
      AND (t.dependant_on IS NULL OR dep.status = 'Complete')
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
    WHERE p_include_active AND t.status = 'In Progress'
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
-- 2. USER TOKEN: Claim tasks with run_type filtering
-- =============================================================================

-- Drop existing function first to avoid signature conflicts
DROP FUNCTION IF EXISTS claim_next_task_user(UUID, BOOLEAN);

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
        (p_include_active AND t.status = 'In Progress') OR
        -- For normal mode, only claim Queued tasks with resolved dependencies
        (t.status = 'Queued' AND (t.dependant_on IS NULL OR dep.status = 'Complete'))
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
-- 3. SERVICE ROLE: Count tasks with run_type filtering
-- =============================================================================

-- Drop existing function first to avoid signature conflicts
DROP FUNCTION IF EXISTS count_eligible_tasks_service_role(BOOLEAN);

CREATE OR REPLACE FUNCTION count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL  -- New parameter: 'gpu', 'api', or NULL (no filtering)
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_capacity INTEGER := 0;
BEGIN
  -- Calculate per-user capacity and sum across all eligible users (with run_type filter)
  WITH per_user_capacity AS (
    SELECT 
      u.id as user_id,
      u.credits,
      COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
      COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as in_progress_count,
      COUNT(CASE 
        WHEN t.status = 'Queued' 
          AND (t.dependant_on IS NULL OR dep.status = 'Complete')
          -- Add run_type filtering if specified
          AND (p_run_type IS NULL OR get_task_run_type(t.task_type) = p_run_type)
        THEN 1 
      END) as ready_queued_count,
      COUNT(CASE 
        WHEN t.status = 'In Progress' 
          AND t.worker_id IS NOT NULL 
          AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
          -- Add run_type filtering if specified
          AND (p_run_type IS NULL OR get_task_run_type(t.task_type) = p_run_type)
        THEN 1 
      END) as cloud_active_non_orch_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN tasks dep ON t.dependant_on = dep.id
    WHERE u.credits > 0
      AND COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) = true
    GROUP BY u.id, u.credits, u.settings
    HAVING COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) < 5
  )
  SELECT COALESCE(SUM(
    CASE 
      WHEN p_include_active THEN
        -- Capacity for queued + current active (capped at 5 total per user)
        LEAST(5, in_progress_count + ready_queued_count)
      ELSE
        -- Capacity for new queued tasks only (respecting current in-progress)
        GREATEST(0, LEAST(5 - in_progress_count, ready_queued_count))
    END
  ), 0) INTO v_total_capacity
  FROM per_user_capacity;

  RETURN v_total_capacity;
END;
$$;

-- =============================================================================
-- 4. USER TOKEN: Count tasks with run_type filtering
-- =============================================================================

-- Drop existing function first to avoid signature conflicts
DROP FUNCTION IF EXISTS count_eligible_tasks_user(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION count_eligible_tasks_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL  -- New parameter: 'gpu', 'api', or NULL (no filtering)
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_user_credits NUMERIC;
  v_in_progress_count INTEGER;
  v_ready_queued_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Get user eligibility and task counts (with run_type filter)
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    u.credits,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as in_progress_count,
    COUNT(CASE 
      WHEN t.status = 'Queued' 
        AND (t.dependant_on IS NULL OR dep.status = 'Complete')
        -- Add run_type filtering if specified
        AND (p_run_type IS NULL OR get_task_run_type(t.task_type) = p_run_type)
      THEN 1 
    END) as ready_queued_count
  INTO v_allows_local, v_user_credits, v_in_progress_count, v_ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON t.dependant_on = dep.id
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings, u.credits;

  -- Check basic eligibility
  IF NOT v_allows_local OR v_user_credits <= 0 OR v_in_progress_count >= 5 THEN
    RETURN 0;
  END IF;

  -- Calculate capacity based on mode
  IF p_include_active THEN
    -- Total capacity: current in-progress + ready queued (capped at 5)
    -- For user mode, we include all in-progress (not just non-orchestrator)
    v_capacity := LEAST(5, COALESCE(v_in_progress_count, 0) + COALESCE(v_ready_queued_count, 0));
  ELSE
    -- Claimable capacity: how many new tasks can be claimed right now
    v_capacity := GREATEST(0, LEAST(5 - COALESCE(v_in_progress_count, 0), COALESCE(v_ready_queued_count, 0)));
  END IF;

  RETURN v_capacity;
END;
$$;

-- =============================================================================
-- 5. Update analysis functions to support run_type filtering
-- =============================================================================

-- Drop existing function first to avoid signature conflicts
DROP FUNCTION IF EXISTS analyze_task_availability_service_role(BOOLEAN);

CREATE OR REPLACE FUNCTION analyze_task_availability_service_role(
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL  -- New parameter for run_type filtering
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_tasks INTEGER;
  v_eligible_tasks INTEGER;
  v_reasons JSONB := '{}';
  v_user_stats JSONB := '{}';
BEGIN
  -- Count total tasks in the requested status (with run_type filter)
  IF p_include_active THEN
    SELECT COUNT(*) INTO v_total_tasks 
    FROM tasks t
    WHERE t.status IN ('Queued', 'In Progress')
      AND (p_run_type IS NULL OR get_task_run_type(t.task_type) = p_run_type);
  ELSE
    SELECT COUNT(*) INTO v_total_tasks 
    FROM tasks t
    WHERE t.status = 'Queued'
      AND (p_run_type IS NULL OR get_task_run_type(t.task_type) = p_run_type);
  END IF;
  
  -- Count eligible tasks
  SELECT count_eligible_tasks_service_role(p_include_active, p_run_type) INTO v_eligible_tasks;
  
  -- If no tasks are eligible but there are tasks, analyze why
  IF v_eligible_tasks = 0 AND v_total_tasks > 0 THEN
    -- Count rejection reasons (with run_type considerations)
    WITH task_analysis AS (
      SELECT 
        t.id,
        t.status,
        t.task_type,
        p.user_id,
        u.credits,
        COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
        COUNT(ip.id) as in_progress_count,
        get_task_run_type(t.task_type) as actual_run_type,
        CASE 
          WHEN p_run_type IS NOT NULL AND get_task_run_type(t.task_type) != p_run_type THEN 'wrong_run_type'
          WHEN u.credits <= 0 THEN 'no_credits'
          WHEN NOT COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) THEN 'cloud_disabled'
          WHEN COUNT(ip.id) >= 5 THEN 'concurrency_limit'
          WHEN t.dependant_on IS NOT NULL AND dep.status != 'Complete' THEN 'dependency_blocked'
          ELSE 'unknown'
        END as rejection_reason
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN tasks ip ON ip.project_id = p.id AND ip.status = 'In Progress'
      LEFT JOIN tasks dep ON dep.id = t.dependant_on
      WHERE (p_include_active AND t.status IN ('Queued', 'In Progress')) 
         OR (NOT p_include_active AND t.status = 'Queued')
      GROUP BY t.id, t.status, t.task_type, p.user_id, u.credits, u.settings, t.dependant_on, dep.status
    )
    SELECT jsonb_object_agg(rejection_reason, count)
    INTO v_reasons
    FROM (
      SELECT rejection_reason, COUNT(*) as count
      FROM task_analysis
      GROUP BY rejection_reason
    ) reason_counts;
    
    -- Get per-user statistics
    WITH user_analysis AS (
      SELECT 
        u.id as user_id,
        u.credits,
        COUNT(CASE WHEN t.status = 'Queued' THEN 1 END) as queued_tasks,
        COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as in_progress_tasks,
        COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE EXISTS (
        SELECT 1 FROM tasks t2 
        JOIN projects p2 ON t2.project_id = p2.id 
        WHERE p2.user_id = u.id 
        AND ((p_include_active AND t2.status IN ('Queued', 'In Progress')) 
             OR (NOT p_include_active AND t2.status = 'Queued'))
        AND (p_run_type IS NULL OR get_task_run_type(t2.task_type) = p_run_type)
      )
      GROUP BY u.id, u.credits, u.settings
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'credits', credits,
        'queued_tasks', queued_tasks,
        'in_progress_tasks', in_progress_tasks,
        'allows_cloud', allows_cloud,
        'at_limit', in_progress_tasks >= 5
      )
    )
    INTO v_user_stats
    FROM user_analysis;
  END IF;
  
  -- Build result
  v_result := jsonb_build_object(
    'total_tasks', v_total_tasks,
    'eligible_tasks', v_eligible_tasks,
    'include_active', p_include_active,
    'run_type_filter', p_run_type,
    'rejection_reasons', COALESCE(v_reasons, '{}'),
    'user_stats', COALESCE(v_user_stats, '[]')
  );
  
  RETURN v_result;
END;
$$;

-- =============================================================================
-- 6. Update function comments
-- =============================================================================

COMMENT ON FUNCTION claim_next_task_service_role IS 'Optimized function to atomically claim next eligible task for service role (cloud processing) with optional run_type filtering';
COMMENT ON FUNCTION claim_next_task_user IS 'Optimized function to atomically claim next eligible task for specific user (local processing) with optional run_type filtering';
COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Count eligible tasks for service role without claiming (dry run) with optional run_type filtering';
COMMENT ON FUNCTION count_eligible_tasks_user IS 'Count eligible tasks for specific user without claiming (dry run) with optional run_type filtering';

-- Add PAT-friendly versions of count functions that bypass credits and run_type constraints
-- PAT users should be able to see all their tasks regardless of credits or run_type

-- =============================================================================
-- count_eligible_tasks_user_pat - PAT version without credits/run_type constraints
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_eligible_tasks_user_pat(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_allows_local BOOLEAN;
  v_in_progress_count INTEGER;
  v_ready_queued_count INTEGER;
  v_capacity INTEGER;
BEGIN
  -- Aggregate per-user eligibility and counts
  -- Exclude orchestrator tasks from In Progress counts for capacity calculations
  -- NO CREDITS CHECK and NO RUN_TYPE FILTERING for PAT users
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true) AS allows_local,
    COUNT(CASE 
      WHEN t.status = 'In Progress' 
        AND COALESCE(t.task_type, '') NOT ILIKE '%orchestrator%'
      THEN 1 
    END) AS in_progress_count,
    COUNT(CASE 
      WHEN t.status = 'Queued'
        AND (t.dependant_on IS NULL OR dep.status = 'Complete')
        -- NO run_type filtering for PAT users
      THEN 1 
    END) AS ready_queued_count
  INTO v_allows_local, v_in_progress_count, v_ready_queued_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks t ON t.project_id = p.id
  LEFT JOIN tasks dep ON dep.id = t.dependant_on
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings;

  -- Eligibility checks (using non-orchestrator In Progress count)
  -- ONLY check allows_local and concurrency limit, NO CREDITS CHECK for PAT users
  IF NOT v_allows_local OR COALESCE(v_in_progress_count, 0) >= 5 THEN
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

COMMENT ON FUNCTION public.count_eligible_tasks_user_pat(UUID, BOOLEAN) IS
'PAT-friendly version: Returns capacity-limited task counts for a user without credits or run_type constraints. Excludes orchestrator tasks from In Progress counts for capacity calculations.';

-- =============================================================================
-- analyze_task_availability_user_pat - PAT version without credits constraint
-- =============================================================================

CREATE OR REPLACE FUNCTION analyze_task_availability_user_pat(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_user_info JSONB;
  v_projects JSONB;
  v_tasks JSONB;
BEGIN
  -- Get user information (no credits constraint for PAT)
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
  
  -- Get user's tasks (no run_type filtering for PAT)
  WITH user_tasks AS (
    SELECT 
      t.id,
      t.task_type,
      t.status,
      t.created_at,
      t.dependant_on,
      CASE WHEN t.dependant_on IS NOT NULL THEN dep.status END as dependency_status,
      p.name as project_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks dep ON dep.id = t.dependant_on
    WHERE p.user_id = p_user_id
      AND ((p_include_active AND t.status IN ('Queued', 'In Progress')) 
           OR (NOT p_include_active AND t.status = 'Queued'))
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
      'has_dependency', dependant_on IS NOT NULL,
      'dependency_status', dependency_status,
      'dependency_blocking', dependant_on IS NOT NULL AND dependency_status != 'Complete'
    )
  )
  INTO v_tasks
  FROM user_tasks;
  
  -- Build result using PAT-friendly count function
  v_result := jsonb_build_object(
    'user_info', COALESCE(v_user_info, '{}'),
    'projects', COALESCE(v_projects, '[]'),
    'recent_tasks', COALESCE(v_tasks, '[]'),
    'eligible_count', count_eligible_tasks_user_pat(p_user_id, p_include_active)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analyze_task_availability_user_pat IS 'PAT-friendly version: Provides detailed analysis of task availability for a specific user without credits or run_type constraints';

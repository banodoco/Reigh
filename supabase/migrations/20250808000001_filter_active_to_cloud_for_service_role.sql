-- Restrict service-role active task counting to cloud-claimed tasks only
-- When include_active=true for service-role dry-run, only include In Progress tasks
-- that are being processed by cloud workers. We identify these as tasks with a
-- non-null worker_id (local user-claimed tasks do not set worker_id).

-- =============================================================================
-- Update: count_eligible_tasks_service_role
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
    -- Only count cloud-claimed In Progress tasks (worker_id is set)
    SELECT COUNT(*)
    INTO v_active_count
    FROM tasks t
    WHERE t.status = 'In Progress'
      AND t.worker_id IS NOT NULL;
    
    v_count := v_queued_count + v_active_count;
  ELSE
    v_count := v_queued_count;
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION count_eligible_tasks_service_role IS 'Counts eligible queued tasks for service role; if include_active=true, adds only cloud-claimed In Progress tasks (worker_id not null).';

-- =============================================================================
-- Update: analyze_task_availability_service_role
-- =============================================================================

CREATE OR REPLACE FUNCTION analyze_task_availability_service_role(
  p_include_active BOOLEAN DEFAULT FALSE
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
  v_user_stats JSONB := '[]';
BEGIN
  -- Count total tasks in the requested scope
  IF p_include_active THEN
    -- Only include cloud-claimed In Progress tasks alongside Queued
    SELECT COUNT(*) INTO v_total_tasks 
    FROM tasks 
    WHERE status = 'Queued' 
       OR (status = 'In Progress' AND worker_id IS NOT NULL);
  ELSE
    SELECT COUNT(*) INTO v_total_tasks FROM tasks WHERE status = 'Queued';
  END IF;
  
  -- Count eligible tasks using the updated counting function
  SELECT count_eligible_tasks_service_role(p_include_active) INTO v_eligible_tasks;
  
  -- If no tasks are eligible but there are tasks, analyze why
  IF v_eligible_tasks = 0 AND v_total_tasks > 0 THEN
    -- Count rejection reasons
    WITH task_analysis AS (
      SELECT 
        t.id,
        t.status,
        p.user_id,
        u.credits,
        COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud,
        COUNT(ip.id) as in_progress_count,
        CASE 
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
      WHERE (
        p_include_active AND 
        (
          t.status = 'Queued' OR 
          (t.status = 'In Progress' AND t.worker_id IS NOT NULL)
        )
      )
      OR (
        NOT p_include_active AND t.status = 'Queued'
      )
      GROUP BY t.id, t.status, p.user_id, u.credits, u.settings, t.dependant_on, dep.status
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
        COUNT(CASE WHEN t.status = 'In Progress' AND t.worker_id IS NOT NULL THEN 1 END) as in_progress_tasks,
        COALESCE((u.settings->'ui'->'generationMethods'->>'inCloud')::boolean, true) as allows_cloud
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE EXISTS (
        SELECT 1 FROM tasks t2 
        JOIN projects p2 ON t2.project_id = p2.id 
        WHERE p2.user_id = u.id 
          AND (
            (p_include_active AND (t2.status = 'Queued' OR (t2.status = 'In Progress' AND t2.worker_id IS NOT NULL))) 
            OR (NOT p_include_active AND t2.status = 'Queued')
          )
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
    'rejection_reasons', COALESCE(v_reasons, '{}'),
    'user_stats', COALESCE(v_user_stats, '[]')
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analyze_task_availability_service_role IS 'Analyzes task availability for service role; include_active considers only cloud-claimed In Progress tasks (worker_id not null).';



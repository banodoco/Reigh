-- Add debugging functions to match original functionality
-- These provide detailed analysis when no tasks are available

-- =============================================================================
-- DIAGNOSTIC FUNCTION: Analyze why no tasks are claimable
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
  v_user_stats JSONB := '{}';
BEGIN
  -- Count total tasks in the requested status
  IF p_include_active THEN
    SELECT COUNT(*) INTO v_total_tasks FROM tasks WHERE status IN ('Queued', 'In Progress');
  ELSE
    SELECT COUNT(*) INTO v_total_tasks FROM tasks WHERE status = 'Queued';
  END IF;
  
  -- Count eligible tasks
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
      WHERE (p_include_active AND t.status IN ('Queued', 'In Progress')) 
         OR (NOT p_include_active AND t.status = 'Queued')
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

-- =============================================================================
-- DIAGNOSTIC FUNCTION: Analyze user-specific task availability
-- =============================================================================

CREATE OR REPLACE FUNCTION analyze_task_availability_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_user_info JSONB;
  v_projects JSONB;
  v_tasks JSONB;
BEGIN
  -- Get user information
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
  
  -- Get user's tasks
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
  
  -- Build result
  v_result := jsonb_build_object(
    'user_info', COALESCE(v_user_info, '{}'),
    'projects', COALESCE(v_projects, '[]'),
    'recent_tasks', COALESCE(v_tasks, '[]'),
    'eligible_count', count_eligible_tasks_user(p_user_id, p_include_active)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analyze_task_availability_service_role IS 'Provides detailed analysis of why tasks may not be claimable for service role';
COMMENT ON FUNCTION analyze_task_availability_user IS 'Provides detailed analysis of task availability for a specific user';

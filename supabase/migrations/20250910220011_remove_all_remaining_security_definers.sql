-- Remove SECURITY DEFINER from ALL remaining functions to eliminate any possibility of RLS conflicts
-- This is a comprehensive cleanup to resolve the persistent shot_id ambiguity error

BEGIN;

-- Remove SECURITY DEFINER from prevent_timing_manipulation
CREATE OR REPLACE FUNCTION prevent_timing_manipulation()
RETURNS TRIGGER
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Allow if this is from a system function (claim/complete)
  IF current_setting('application_name', true) IN ('claim_task', 'complete_task') THEN
    RETURN NEW;
  END IF;
  
  -- Block direct timing changes by users
  IF TG_OP = 'UPDATE' AND (
    OLD.generation_started_at IS DISTINCT FROM NEW.generation_started_at OR
    OLD.generation_processed_at IS DISTINCT FROM NEW.generation_processed_at
  ) THEN
    RAISE EXCEPTION 'Timing fields can only be modified by system functions';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Remove SECURITY DEFINER from get_task_run_type
CREATE OR REPLACE FUNCTION get_task_run_type(p_task_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
DECLARE
    run_type_result text;
BEGIN
    SELECT run_type INTO run_type_result
    FROM task_types
    WHERE name = p_task_type AND is_active = true;
    
    RETURN COALESCE(run_type_result, 'unknown');
END;
$$;

-- Remove SECURITY DEFINER from count_eligible_tasks_service_role
CREATE OR REPLACE FUNCTION count_eligible_tasks_service_role(
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM tasks t
    JOIN task_types tt ON t.task_type = tt.name
    WHERE 
      (t.status = 'Queued' OR (p_include_active AND t.status = 'In Progress'))
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND tt.is_active = true
  );
END;
$$;

-- Remove SECURITY DEFINER from count_eligible_tasks_user
CREATE OR REPLACE FUNCTION count_eligible_tasks_user(
  p_user_id UUID,
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN task_types tt ON t.task_type = tt.name
    WHERE 
      p.user_id = p_user_id
      AND (t.status = 'Queued' OR (p_include_active AND t.status = 'In Progress'))
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND tt.is_active = true
  );
END;
$$;

-- Remove SECURITY DEFINER from per_user_capacity_stats_service_role
CREATE OR REPLACE FUNCTION per_user_capacity_stats_service_role()
RETURNS TABLE(
  user_id UUID,
  credits NUMERIC,
  queued_tasks BIGINT,
  in_progress_tasks BIGINT,
  total_pending_tasks BIGINT
)
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.credits,
    COALESCE(queued.task_count, 0) as queued_tasks,
    COALESCE(in_progress.task_count, 0) as in_progress_tasks,
    COALESCE(queued.task_count, 0) + COALESCE(in_progress.task_count, 0) as total_pending_tasks
  FROM users u
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Queued'
    GROUP BY p.user_id
  ) queued ON u.id = queued.user_id
  LEFT JOIN (
    SELECT 
      p.user_id,
      COUNT(*) as task_count
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'In Progress'
    GROUP BY p.user_id
  ) in_progress ON u.id = in_progress.user_id
  WHERE u.credits IS NOT NULL
  ORDER BY total_pending_tasks DESC, u.credits DESC;
END;
$$;

-- Remove SECURITY DEFINER from complete_task_with_timing
CREATE OR REPLACE FUNCTION complete_task_with_timing(
  p_task_id TEXT,
  p_output_location TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
DECLARE
    task_uuid UUID;
    rows_updated INTEGER;
BEGIN
    -- Convert string ID to UUID with error handling
    BEGIN
        task_uuid := p_task_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid task_id format: %', p_task_id;
    END;

    -- Complete the task with timing information
    UPDATE tasks
    SET
        status = 'Complete'::task_status,
        output_location = p_output_location,
        updated_at = CURRENT_TIMESTAMP,
        generation_processed_at = CURRENT_TIMESTAMP
    WHERE id = task_uuid;
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    
    RETURN rows_updated > 0;
END;
$$;

-- Add comments explaining the changes
COMMENT ON FUNCTION prevent_timing_manipulation IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION get_task_run_type IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION count_eligible_tasks_service_role IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION count_eligible_tasks_user IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION per_user_capacity_stats_service_role IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION complete_task_with_timing IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMIT;

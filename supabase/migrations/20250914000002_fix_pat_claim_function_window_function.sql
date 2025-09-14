-- Fix PAT claim function - remove window function that conflicts with FOR UPDATE
-- PostgreSQL doesn't allow ROW_NUMBER() with FOR UPDATE SKIP LOCKED

CREATE OR REPLACE FUNCTION claim_next_task_user_pat(
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
AS $$
DECLARE
  v_task_id UUID;
  v_params JSONB;
  v_task_type TEXT;
  v_project_id UUID;
  v_status_filter task_status[];
  v_allows_local BOOLEAN;
  v_in_progress_count INTEGER;
BEGIN
  -- Set status filter based on include_active flag (with proper enum casting)
  IF p_include_active THEN
    v_status_filter := ARRAY['Queued'::task_status, 'In Progress'::task_status];
  ELSE
    v_status_filter := ARRAY['Queued'::task_status];
  END IF;

  -- Get user preferences and validate eligibility
  -- NO CREDITS CHECK for PAT users
  SELECT 
    COALESCE((u.settings->'ui'->'generationMethods'->>'onComputer')::boolean, true),
    COUNT(in_progress_tasks.id)
  INTO v_allows_local, v_in_progress_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  LEFT JOIN tasks in_progress_tasks ON in_progress_tasks.project_id = p.id 
    AND in_progress_tasks.status = 'In Progress'::task_status
    -- Exclude orchestrator tasks from concurrency limit
    AND COALESCE(in_progress_tasks.task_type, '') NOT ILIKE '%orchestrator%'
  WHERE u.id = p_user_id
  GROUP BY u.id, u.settings;

  -- Early exit if user doesn't meet basic criteria
  -- ONLY check allows_local and concurrency limit, NO CREDITS CHECK for PAT users
  IF NOT v_allows_local OR v_in_progress_count >= 5 THEN
    RETURN;
  END IF;

  -- Find and claim the next eligible task atomically
  -- Remove window function and use simple ORDER BY with LIMIT
  WITH user_projects AS (
    SELECT id FROM projects WHERE user_id = p_user_id
  ),
  claimed_task AS (
    UPDATE tasks 
    SET 
      status = 'In Progress'::task_status,
      generation_started_at = NOW()
    WHERE tasks.id = (
      -- Subquery to find the oldest eligible task
      SELECT t.id
      FROM tasks t
      JOIN user_projects up ON t.project_id = up.id
      LEFT JOIN tasks dep ON dep.id = t.dependant_on
      WHERE t.status = ANY(v_status_filter)
        AND (t.dependant_on IS NULL OR dep.status = 'Complete'::task_status)
        -- NO run_type filtering for PAT users
      ORDER BY t.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    AND tasks.status = 'Queued'::task_status  -- Double-check it's still queued
    RETURNING tasks.id, tasks.params, tasks.task_type, tasks.project_id
  )
  SELECT ct.id, ct.params, ct.task_type, ct.project_id
  FROM claimed_task ct;

  RETURN;
END;
$$;

COMMENT ON FUNCTION claim_next_task_user_pat IS 'PAT-friendly version: Atomically claims next eligible task for specific user without credits or run_type constraints. Fixed window function issue.';

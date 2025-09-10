-- Remove SECURITY DEFINER from all remaining functions to eliminate RLS conflicts
-- This should resolve any remaining "column reference is ambiguous" errors

BEGIN;

-- Remove SECURITY DEFINER from analyze_task_availability_service_role
CREATE OR REPLACE FUNCTION analyze_task_availability_service_role(
  p_include_active BOOLEAN DEFAULT FALSE,
  p_run_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  total_tasks INTEGER,
  queued_tasks INTEGER,
  in_progress_tasks INTEGER,
  run_type TEXT,
  task_breakdown JSONB
)
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH task_stats AS (
    SELECT 
      COUNT(*)::INTEGER as total,
      COUNT(*) FILTER (WHERE t.status = 'Queued'::task_status)::INTEGER as queued,
      COUNT(*) FILTER (WHERE t.status = 'In Progress'::task_status)::INTEGER as in_progress,
      COALESCE(tt.run_type, 'unknown') as task_run_type,
      jsonb_object_agg(
        COALESCE(t.task_type, 'unknown'),
        COUNT(*)
      ) as breakdown
    FROM tasks t
    LEFT JOIN task_types tt ON tt.name = t.task_type AND tt.is_active = true
    WHERE (NOT p_include_active OR t.status IN ('Queued'::task_status, 'In Progress'::task_status))
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
      AND tt.is_active = true
    GROUP BY tt.run_type
  )
  SELECT 
    ts.total,
    ts.queued,
    ts.in_progress,
    ts.task_run_type,
    ts.breakdown
  FROM task_stats ts;
END;
$$;

-- Remove SECURITY DEFINER from insert_shot_at_position
CREATE OR REPLACE FUNCTION insert_shot_at_position(
  p_project_id UUID,
  p_shot_name TEXT,
  p_position INTEGER
)
RETURNS TABLE(
  shot_id UUID,
  shot_name TEXT,
  shot_position INTEGER,
  success BOOLEAN
)
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
DECLARE
  v_shot_id UUID;
BEGIN
  -- Ownership check
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to insert shot into this project';
  END IF;

  UPDATE shots SET position = position + 1 
  WHERE project_id = p_project_id AND position >= p_position;

  INSERT INTO shots (name, project_id, position)
  VALUES (p_shot_name, p_project_id, p_position)
  RETURNING id INTO v_shot_id;

  RETURN QUERY SELECT v_shot_id, p_shot_name, p_position, TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::INTEGER, FALSE;
END;
$$;

-- Remove SECURITY DEFINER from position_existing_generation_in_shot
CREATE OR REPLACE FUNCTION position_existing_generation_in_shot(
  p_shot_id UUID,
  p_generation_id UUID
)
RETURNS TABLE(
  id UUID,
  shot_id UUID,
  generation_id UUID,
  "position" INTEGER
)
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
DECLARE
  next_pos integer;
  existing_record record;
BEGIN
  -- Find the existing record with NULL position
  SELECT * INTO existing_record
  FROM shot_generations
  WHERE shot_id = p_shot_id 
    AND generation_id = p_generation_id 
    AND "position" IS NULL
  LIMIT 1;
  
  IF existing_record IS NULL THEN
    -- No existing record with NULL position found
    RAISE EXCEPTION 'No existing shot_generation with NULL position found for shot_id % and generation_id %', p_shot_id, p_generation_id;
  END IF;
  
  -- Get the next position for this shot
  SELECT COALESCE(MAX("position") + 1, 0) INTO next_pos
  FROM shot_generations
  WHERE shot_id = p_shot_id 
    AND "position" IS NOT NULL;
  
  -- Update the existing record with the new position
  UPDATE shot_generations
  SET "position" = next_pos
  WHERE id = existing_record.id
  RETURNING * INTO existing_record;
  
  -- Return the updated record
  RETURN QUERY SELECT 
    existing_record.id,
    existing_record.shot_id,
    existing_record.generation_id,
    existing_record."position";
END;
$$;

-- Remove SECURITY DEFINER from prevent_direct_credit_updates
CREATE OR REPLACE FUNCTION prevent_direct_credit_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
-- REMOVED SECURITY DEFINER
AS $$
BEGIN
  -- Allow if called by service role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent direct credit updates by regular users
  IF OLD.credits IS DISTINCT FROM NEW.credits THEN
    RAISE EXCEPTION 'Direct credit updates are not allowed. Use the credits_ledger table.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Keep create_referral_from_session with SECURITY DEFINER as it needs elevated privileges
-- This function is not related to task completion so it shouldn't cause the shot_id ambiguity

-- Add comments explaining the changes
COMMENT ON FUNCTION analyze_task_availability_service_role IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION insert_shot_at_position IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION position_existing_generation_in_shot IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMENT ON FUNCTION prevent_direct_credit_updates IS 
'Removed SECURITY DEFINER - now runs with caller privileges';

COMMIT;

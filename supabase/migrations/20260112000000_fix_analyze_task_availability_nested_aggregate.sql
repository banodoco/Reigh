-- Fix nested aggregate bug in analyze_task_availability_service_role
-- The original had jsonb_object_agg(task_type, COUNT(*)) which nests aggregates
-- This version pre-computes counts in a subquery

BEGIN;

-- Drop the old function first (changing implementation)
DROP FUNCTION IF EXISTS analyze_task_availability_service_role(BOOLEAN, TEXT);

-- Recreate with fixed logic - no nested aggregates
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
AS $$
BEGIN
  RETURN QUERY
  WITH task_type_counts AS (
    -- First, count tasks by type (no nesting - single aggregate)
    SELECT 
      COALESCE(t.task_type, 'unknown') as task_type_name,
      COUNT(*)::INTEGER as type_count,
      COALESCE(tt.run_type, 'unknown') as task_run_type
    FROM tasks t
    LEFT JOIN task_types tt ON tt.name = t.task_type AND tt.is_active = true
    WHERE (p_include_active AND t.status IN ('Queued'::task_status, 'In Progress'::task_status))
       OR (NOT p_include_active AND t.status = 'Queued'::task_status)
    GROUP BY t.task_type, tt.run_type
  ),
  filtered_type_counts AS (
    SELECT * FROM task_type_counts
    WHERE p_run_type IS NULL OR task_run_type = p_run_type
  ),
  status_counts AS (
    -- Separate query for status counts
    SELECT 
      COUNT(*)::INTEGER as total,
      COUNT(*) FILTER (WHERE t.status = 'Queued'::task_status)::INTEGER as queued,
      COUNT(*) FILTER (WHERE t.status = 'In Progress'::task_status)::INTEGER as in_progress
    FROM tasks t
    LEFT JOIN task_types tt ON tt.name = t.task_type AND tt.is_active = true
    WHERE (p_include_active AND t.status IN ('Queued'::task_status, 'In Progress'::task_status))
       OR (NOT p_include_active AND t.status = 'Queued'::task_status)
      AND (p_run_type IS NULL OR tt.run_type = p_run_type)
  ),
  breakdown_agg AS (
    -- Now aggregate the pre-computed counts (single aggregate, not nested)
    SELECT COALESCE(
      jsonb_object_agg(task_type_name, type_count),
      '{}'::jsonb
    ) as breakdown
    FROM filtered_type_counts
  )
  SELECT 
    sc.total,
    sc.queued,
    sc.in_progress,
    p_run_type,
    ba.breakdown
  FROM status_counts sc, breakdown_agg ba;
END;
$$;

COMMENT ON FUNCTION analyze_task_availability_service_role IS 
'Returns task availability analysis. Fixed nested aggregate bug - now pre-computes counts before aggregating.';

COMMIT;

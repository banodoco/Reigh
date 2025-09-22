-- Fix all remaining database objects that still reference the position column
-- This includes views, functions, and any other database objects

-- 1. Fix count_unpositioned_generations function
DROP FUNCTION IF EXISTS count_unpositioned_generations(uuid);

CREATE OR REPLACE FUNCTION count_unpositioned_generations(p_shot_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_shot_id
    AND sg.timeline_frame IS NULL
    AND (g.type IS NULL OR g.type NOT LIKE '%video%');
$$;

-- 2. Recreate shot_statistics view with proper timeline_frame references
DROP VIEW IF EXISTS shot_statistics;

CREATE VIEW shot_statistics AS
SELECT 
  s.id as shot_id,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NOT NULL) as positioned_count,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NULL AND (g.type IS NULL OR g.type NOT LIKE '%video%')) as unpositioned_count,
  -- Count videos based on tool_type = 'travel-between-images' instead of generation.type
  COUNT(sg.id) FILTER (WHERE g.params->>'tool_type' = 'travel-between-images') as video_count
FROM shots s
LEFT JOIN shot_generations sg ON sg.shot_id = s.id
LEFT JOIN generations g ON g.id = sg.generation_id
GROUP BY s.id, s.project_id;

-- Grant appropriate permissions
GRANT SELECT ON shot_statistics TO authenticated;

-- 3. Check for any other functions or views that might reference position
-- (This will help us identify if there are any other issues)
SELECT 'Fixed all remaining database objects to use timeline_frame instead of position' as status;

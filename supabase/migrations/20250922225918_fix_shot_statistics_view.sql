-- Fix the shot_statistics view to not depend on position column
-- Replace position references with timeline_frame

-- First, drop the existing view
DROP VIEW IF EXISTS shot_statistics;

-- Create the view without position dependencies
CREATE VIEW shot_statistics AS
SELECT
  s.id as shot_id,
  s.name as shot_name,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NOT NULL) as positioned_generations,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NULL) as unpositioned_generations,
  MIN(sg.timeline_frame) as min_timeline_frame,
  MAX(sg.timeline_frame) as max_timeline_frame,
  AVG(sg.timeline_frame) as avg_timeline_frame,
  s.created_at,
  s.updated_at
FROM shots s
LEFT JOIN shot_generations sg ON s.id = sg.shot_id
GROUP BY s.id, s.name, s.project_id, s.created_at, s.updated_at;

-- Grant permissions
GRANT SELECT ON shot_statistics TO authenticated;

-- Verify the view was created
SELECT 'Fixed shot_statistics view to use timeline_frame instead of position' as status;

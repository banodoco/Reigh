-- Fix shot_statistics view to count only actual videos, not all travel-between-images generations
-- This ensures the cached video counts match what VideoOutputsGallery displays
-- Issue: View was counting all travel-between-images generations (including images)
--        but gallery filters by type LIKE '%video%'

DROP VIEW IF EXISTS shot_statistics;

CREATE VIEW shot_statistics AS
SELECT 
  s.id as shot_id,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NOT NULL) as positioned_count,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NULL AND (g.type IS NULL OR g.type NOT LIKE '%video%')) as unpositioned_count,
  -- FIXED: Count only items that are BOTH from travel-between-images AND have video type
  -- This matches the filtering logic in VideoOutputsGallery which filters by mediaType='video'
  COUNT(sg.id) FILTER (WHERE g.params->>'tool_type' = 'travel-between-images' AND g.type LIKE '%video%') as video_count
FROM shots s
LEFT JOIN shot_generations sg ON sg.shot_id = s.id
LEFT JOIN generations g ON g.id = sg.generation_id
GROUP BY s.id, s.project_id;

-- Grant appropriate permissions
GRANT SELECT ON shot_statistics TO authenticated;

-- Add comment explaining the fix
COMMENT ON VIEW shot_statistics IS 
'Shot-level statistics including video counts. 
video_count filters by BOTH tool_type=travel-between-images AND type LIKE %video% 
to match the display logic in VideoOutputsGallery.';


-- Fix final_video_count to include join-clips tool type
-- The join-clips tool is used to create final videos by joining segments,
-- and these videos should be counted as final videos in FinalVideoSection.

DROP VIEW IF EXISTS shot_statistics;

CREATE VIEW shot_statistics AS
SELECT
  s.id as shot_id,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NOT NULL) as positioned_count,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NULL AND (g.type IS NULL OR g.type NOT LIKE '%video%')) as unpositioned_count,
  -- video_count: All videos from travel-between-images (includes segments)
  COUNT(sg.id) FILTER (WHERE g.params->>'tool_type' = 'travel-between-images' AND g.type LIKE '%video%') as video_count,
  -- final_video_count: Videos actually displayed in FinalVideoSection
  -- Must have: location (actual video file), parent_generation_id IS NULL, AND (orchestrator_details OR children)
  -- Include both travel-between-images and join-clips tool types
  COUNT(sg.id) FILTER (
    WHERE g.params->>'tool_type' IN ('travel-between-images', 'join-clips')
    AND g.type LIKE '%video%'
    AND g.parent_generation_id IS NULL
    AND g.location IS NOT NULL
    AND g.location != ''
    AND (
      g.params->'orchestrator_details' IS NOT NULL
      OR EXISTS (SELECT 1 FROM generations c WHERE c.parent_generation_id = g.id)
    )
  ) as final_video_count
FROM shots s
LEFT JOIN shot_generations sg ON sg.shot_id = s.id
LEFT JOIN generations g ON g.id = sg.generation_id
GROUP BY s.id, s.project_id;

-- Grant appropriate permissions
GRANT SELECT ON shot_statistics TO authenticated;

-- Add comment explaining the columns
COMMENT ON VIEW shot_statistics IS
'Shot-level statistics including video counts.
- video_count: All travel-between-images videos (includes segments)
- final_video_count: Parent videos (parent_generation_id IS NULL) shown in FinalVideoSection, including join-clips outputs';

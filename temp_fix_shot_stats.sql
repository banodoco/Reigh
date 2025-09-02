-- Update shot_statistics view to count videos based on tool_type instead of generation.type
CREATE OR REPLACE VIEW shot_statistics AS
SELECT 
  s.id as shot_id,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.position IS NOT NULL) as positioned_count,
  COUNT(sg.id) FILTER (WHERE sg.position IS NULL AND (g.type IS NULL OR g.type NOT LIKE '%video%')) as unpositioned_count,
  COUNT(sg.id) FILTER (WHERE g.params->>'tool_type' = 'travel-between-images') as video_count
FROM shots s
LEFT JOIN shot_generations sg ON sg.shot_id = s.id
LEFT JOIN generations g ON g.id = sg.generation_id
GROUP BY s.id, s.project_id;

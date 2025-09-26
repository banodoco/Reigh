-- Query to find shot_generations connected to generations with type = 'video'

SELECT 
  sg.id as shot_generation_id,
  sg.shot_id,
  sg.generation_id,
  sg.timeline_frame,
  sg.created_at,
  sg.updated_at,
  sg.metadata,
  g.type as generation_type,
  g.params,
  g.location,
  g.project_id,
  g.starred,
  g.thumbnail_url
FROM shot_generations sg
INNER JOIN generations g ON sg.generation_id = g.id
WHERE g.type = 'video'
ORDER BY sg.shot_id, sg.timeline_frame;

-- Summary count by shot
SELECT 
  sg.shot_id,
  COUNT(*) as video_generation_count
FROM shot_generations sg
INNER JOIN generations g ON sg.generation_id = g.id
WHERE g.type = 'video'
GROUP BY sg.shot_id
ORDER BY video_generation_count DESC;

-- Overall summary
SELECT 
  COUNT(*) as total_video_shot_generations,
  COUNT(DISTINCT sg.shot_id) as shots_with_videos,
  COUNT(DISTINCT sg.generation_id) as unique_video_generations
FROM shot_generations sg
INNER JOIN generations g ON sg.generation_id = g.id
WHERE g.type = 'video';

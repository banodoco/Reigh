-- Query to remove timeline_frame from shot_generations connected to video generations
-- This will set timeline_frame to NULL for all shot_generations where generations.type = 'video'

-- First, show what will be affected
SELECT 
  sg.id as shot_generation_id,
  sg.shot_id,
  sg.generation_id,
  sg.timeline_frame,
  sg.created_at,
  g.type as generation_type
FROM shot_generations sg
INNER JOIN generations g ON sg.generation_id = g.id
WHERE g.type = 'video'
  AND sg.timeline_frame IS NOT NULL
ORDER BY sg.shot_id, sg.timeline_frame;

-- Show count of what will be updated
SELECT 
  COUNT(*) as records_to_update,
  COUNT(DISTINCT sg.shot_id) as affected_shots
FROM shot_generations sg
INNER JOIN generations g ON sg.generation_id = g.id
WHERE g.type = 'video'
  AND sg.timeline_frame IS NOT NULL;

-- Perform the update
UPDATE shot_generations 
SET 
  timeline_frame = NULL,
  updated_at = NOW()
FROM generations g
WHERE shot_generations.generation_id = g.id
  AND g.type = 'video'
  AND shot_generations.timeline_frame IS NOT NULL;

-- Show summary after update
SELECT 
  sg.shot_id,
  COUNT(*) as total_in_shot,
  COUNT(sg.timeline_frame) as with_timeline_frame,
  COUNT(CASE WHEN g.type = 'video' THEN 1 END) as video_generations,
  COUNT(CASE WHEN g.type = 'video' AND sg.timeline_frame IS NULL THEN 1 END) as video_with_null_frame
FROM shot_generations sg
INNER JOIN generations g ON sg.generation_id = g.id
GROUP BY sg.shot_id
HAVING COUNT(CASE WHEN g.type = 'video' THEN 1 END) > 0
ORDER BY sg.shot_id;

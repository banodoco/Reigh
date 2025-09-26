-- Query to reposition timeline_frames for shots that have timeline positions
-- This will update shot_generations that have timeline_frame values to be spaced at 0, 50, 100, 150, etc.
-- Records with NULL timeline_frame will be left unchanged

WITH shot_with_row_numbers AS (
  -- Get shot_generations with row numbers within each shot_id
  -- Only include records that already have a timeline_frame (not NULL)
  SELECT 
    id,
    shot_id,
    timeline_frame,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY shot_id ORDER BY created_at) - 1 as row_num
  FROM shot_generations
  WHERE timeline_frame IS NOT NULL  -- Only process records that already have timeline positions
),
updates_needed AS (
  -- Calculate new timeline_frame values for shot_generations that have positions
  SELECT 
    id,
    shot_id,
    timeline_frame as old_timeline_frame,
    (row_num * 50) as new_timeline_frame
  FROM shot_with_row_numbers
)
-- Update timeline_frame values for records that already have positions
UPDATE shot_generations 
SET 
  timeline_frame = updates_needed.new_timeline_frame,
  updated_at = NOW()
FROM updates_needed
WHERE shot_generations.id = updates_needed.id;

-- Show summary results after update for all shots
SELECT 
  shot_id,
  COUNT(*) as total_generations,
  MIN(timeline_frame) as min_frame,
  MAX(timeline_frame) as max_frame,
  COUNT(DISTINCT timeline_frame) as unique_frames
FROM shot_generations 
GROUP BY shot_id
ORDER BY shot_id;

-- Show detailed results for verification
SELECT 
  shot_id,
  id,
  timeline_frame,
  created_at,
  updated_at
FROM shot_generations 
ORDER BY shot_id, timeline_frame;

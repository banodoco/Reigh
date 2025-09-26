-- Query to reposition timeline_frames for ALL shots (Fixed Version)
-- This will update ALL shot_generations to be spaced at 0, 50, 100, 150, etc.

-- First, let's see the current state ordered by creation time
SELECT 
  shot_id,
  id,
  timeline_frame,
  created_at,
  ROW_NUMBER() OVER (PARTITION BY shot_id ORDER BY created_at) as expected_position
FROM shot_generations 
WHERE shot_id = '4af713a9-ceef-4097-b931-de46684a7389'
ORDER BY created_at;

-- Now the actual update query
WITH shot_with_row_numbers AS (
  -- Get ALL shot_generations with row numbers within each shot_id
  SELECT 
    id,
    shot_id,
    timeline_frame,
    created_at,
    (ROW_NUMBER() OVER (PARTITION BY shot_id ORDER BY created_at) - 1) * 50 as new_timeline_frame
  FROM shot_generations
),
updates_needed AS (
  -- Get the updates we need to make
  SELECT 
    id,
    shot_id,
    timeline_frame as old_timeline_frame,
    new_timeline_frame
  FROM shot_with_row_numbers
  WHERE timeline_frame != new_timeline_frame  -- Only update if different
)
-- Update timeline_frame values
UPDATE shot_generations 
SET 
  timeline_frame = updates_needed.new_timeline_frame,
  updated_at = NOW()
FROM updates_needed
WHERE shot_generations.id = updates_needed.id;

-- Show results after update for that specific shot
SELECT 
  shot_id,
  id,
  timeline_frame,
  created_at,
  updated_at
FROM shot_generations 
WHERE shot_id = '4af713a9-ceef-4097-b931-de46684a7389'
ORDER BY timeline_frame;

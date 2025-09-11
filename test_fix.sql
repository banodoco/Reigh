-- Test the fix by manually triggering your task
UPDATE tasks 
SET updated_at = NOW()
WHERE id = '7c0936c4-4370-4cb9-8576-77f1081dc2da'
  AND task_type = 'qwen_image_edit'
  AND status = 'Complete'
  AND generation_created = FALSE;

-- Check if generation was created
SELECT 
  g.id as generation_id,
  g.params->>'shotId' as shot_id,
  g.location,
  g.type,
  g.created_at
FROM generations g
WHERE g.tasks @> jsonb_build_array('7c0936c4-4370-4cb9-8576-77f1081dc2da');

-- Check if shot association was created WITHOUT position (position should be NULL)
SELECT 
  sg.id,
  sg.shot_id,
  sg.generation_id,
  sg.position,  -- This should be NULL for unpositioned
  sg.created_at
FROM shot_generations sg
JOIN generations g ON sg.generation_id = g.id
WHERE g.tasks @> jsonb_build_array('7c0936c4-4370-4cb9-8576-77f1081dc2da')
  AND sg.shot_id = '0444f08f-0b3a-4917-9fec-ceac79427a5e';

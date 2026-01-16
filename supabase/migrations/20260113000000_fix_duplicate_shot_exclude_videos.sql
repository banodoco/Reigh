-- Fix duplicate_shot function to only copy positioned images, not videos
-- Previously it copied ALL shot_generations including videos and unpositioned items
-- Now it only copies entries with valid timeline_frame (>= 0) and excludes videos

CREATE OR REPLACE FUNCTION duplicate_shot(
  original_shot_id UUID,
  project_id UUID
) RETURNS UUID AS $$
DECLARE
  v_new_shot_id UUID;
  v_original_name TEXT;
  v_original_aspect_ratio TEXT;
  v_original_settings JSONB;
  v_next_position INTEGER;
  v_copied_count INTEGER := 0;
BEGIN
  -- Get the original shot details
  SELECT name, aspect_ratio, settings
  INTO v_original_name, v_original_aspect_ratio, v_original_settings
  FROM shots
  WHERE id = original_shot_id AND shots.project_id = duplicate_shot.project_id;
  
  IF v_original_name IS NULL THEN
    RAISE EXCEPTION 'Shot not found or does not belong to the specified project';
  END IF;
  
  -- Calculate the next position for the new shot (insert after the original)
  SELECT COALESCE(MAX(position), 0) + 1
  INTO v_next_position
  FROM shots
  WHERE shots.project_id = duplicate_shot.project_id;
  
  -- Create the new shot with " (copy)" suffix
  INSERT INTO shots (name, project_id, position, aspect_ratio, settings)
  VALUES (
    v_original_name || ' (copy)',
    duplicate_shot.project_id,
    v_next_position,
    v_original_aspect_ratio,
    v_original_settings
  )
  RETURNING id INTO v_new_shot_id;
  
  -- Copy only positioned images (not videos, not unpositioned items)
  -- Filters:
  --   1. timeline_frame IS NOT NULL AND timeline_frame >= 0 (positioned on timeline)
  --   2. generation.type NOT LIKE '%video%' (excludes 'video' and 'video_travel_output')
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
  SELECT 
    v_new_shot_id,
    sg.generation_id,
    sg.timeline_frame,
    sg.metadata
  FROM shot_generations sg
  JOIN generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = original_shot_id
    AND sg.timeline_frame IS NOT NULL
    AND sg.timeline_frame >= 0
    AND (g.type IS NULL OR g.type NOT LIKE '%video%');
  
  GET DIAGNOSTICS v_copied_count = ROW_COUNT;
  
  RAISE LOG '[DuplicateShot] Created shot % with % positioned images copied from % (excluding videos)', 
    v_new_shot_id, v_copied_count, original_shot_id;
  
  RETURN v_new_shot_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[DuplicateShot] Error: %', SQLERRM;
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Update comment to reflect new behavior
COMMENT ON FUNCTION duplicate_shot IS 'Duplicates a shot including only positioned images (timeline_frame >= 0, excludes videos). Returns the new shot ID.';




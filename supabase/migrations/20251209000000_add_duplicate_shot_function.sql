-- Create a function to duplicate a shot with all its generations
-- This creates a new shot with " (copy)" suffix and copies all shot_generations records

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
  
  -- Copy all shot_generations from the original shot to the new shot
  -- This preserves timeline_frame values and metadata
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame, metadata)
  SELECT 
    v_new_shot_id,
    sg.generation_id,
    sg.timeline_frame,
    sg.metadata
  FROM shot_generations sg
  WHERE sg.shot_id = original_shot_id;
  
  GET DIAGNOSTICS v_copied_count = ROW_COUNT;
  
  RAISE LOG '[DuplicateShot] Created shot % with % generations copied from %', 
    v_new_shot_id, v_copied_count, original_shot_id;
  
  RETURN v_new_shot_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[DuplicateShot] Error: %', SQLERRM;
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION duplicate_shot(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION duplicate_shot IS 'Duplicates a shot including all its shot_generations. Returns the new shot ID.';










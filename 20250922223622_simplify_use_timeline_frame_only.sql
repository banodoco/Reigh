-- Simplify approach: just use timeline_frame for ordering everywhere
-- Remove the computed column complexity and use timeline_frame directly

-- Drop the computed column approach we just created
DROP VIEW IF EXISTS shot_generations_with_computed_position;
DROP FUNCTION IF EXISTS get_computed_position(uuid, integer);
DROP FUNCTION IF EXISTS calculate_position_from_timeline_frame(uuid, integer);

-- Update the duplication function to not require position parameter
CREATE OR REPLACE FUNCTION duplicate_image_in_shot(
  p_shot_id uuid,
  p_generation_id uuid,
  p_project_id uuid
) RETURNS uuid AS $$
DECLARE
  original_timeline_frame integer;
  next_timeline_frame integer;
  duplicate_timeline_frame integer;
  new_shot_generation_id uuid;
BEGIN
  -- Get the original image's timeline_frame
  SELECT timeline_frame INTO original_timeline_frame
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id;
  
  IF original_timeline_frame IS NULL THEN
    RAISE EXCEPTION 'Original image not found or has no timeline_frame';
  END IF;
  
  -- Find the next timeline_frame after the original
  SELECT MIN(timeline_frame) INTO next_timeline_frame
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id 
    AND sg.timeline_frame > original_timeline_frame;
  
  -- Calculate midpoint, or add default spacing if no next frame
  IF next_timeline_frame IS NULL THEN
    duplicate_timeline_frame := original_timeline_frame + 30; -- Half of default 60 spacing
  ELSE
    duplicate_timeline_frame := (original_timeline_frame + next_timeline_frame) / 2;
  END IF;
  
  -- Insert the duplicate with calculated timeline_frame
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
  VALUES (p_shot_id, p_generation_id, duplicate_timeline_frame)
  RETURNING id INTO new_shot_generation_id;
  
  RETURN new_shot_generation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION duplicate_image_in_shot(uuid, uuid, uuid) TO authenticated;

-- Verify the simplification
SELECT 'Simplified to use timeline_frame only, removed computed column complexity' as status;

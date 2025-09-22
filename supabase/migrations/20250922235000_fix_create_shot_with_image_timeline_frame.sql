-- Fix create_shot_with_image to use timeline_frame instead of position
-- This function is used when creating shots with initial images

DROP FUNCTION IF EXISTS create_shot_with_image(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION create_shot_with_image(
  p_project_id UUID,
  p_shot_name TEXT,
  p_generation_id UUID
) RETURNS TABLE (
  shot_id UUID,
  shot_name TEXT,
  shot_generation_id UUID,
  success BOOLEAN
) AS $$
DECLARE
  v_shot_id UUID;
  v_shot_generation_id UUID;
BEGIN
  -- Create the shot first
  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;
  
  -- Add the generation to the shot with timeline_frame 0 (first image)
  INSERT INTO shot_generations (shot_id, generation_id, timeline_frame)
  VALUES (v_shot_id, p_generation_id, 0)
  RETURNING id INTO v_shot_generation_id;
  
  -- Return the results
  RETURN QUERY SELECT 
    v_shot_id,
    p_shot_name,
    v_shot_generation_id,
    TRUE;
    
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN QUERY SELECT 
    NULL::UUID,
    NULL::TEXT,
    NULL::UUID,
    FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_shot_with_image(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION create_shot_with_image IS 
'Updated to use timeline_frame instead of position column. Creates a shot and adds the first generation at timeline_frame 0.';

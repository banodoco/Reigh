-- Create a function to atomically create a shot and add an image to it
-- This ensures the operation is fast and reliable
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
  v_next_position INTEGER;
BEGIN
  -- Create the shot first
  INSERT INTO shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;
  
  -- Add the generation to the shot with position 1
  INSERT INTO shot_generations (shot_id, generation_id, position)
  VALUES (v_shot_id, p_generation_id, 1)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_shot_with_image(UUID, TEXT, UUID) TO authenticated;

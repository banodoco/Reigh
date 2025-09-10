-- Create function to insert a shot at a specific position and shift subsequent shots
-- Only create if it doesn't already exist to avoid conflicts
CREATE OR REPLACE FUNCTION insert_shot_at_position(
  p_project_id UUID,
  p_shot_name TEXT,
  p_position INTEGER
) RETURNS TABLE (
  shot_id UUID,
  shot_name TEXT,
  shot_position INTEGER,
  success BOOLEAN
) AS $$
DECLARE
  v_shot_id UUID;
BEGIN
  -- First, shift all shots at or after the target position up by 1
  UPDATE shots 
  SET position = position + 1 
  WHERE project_id = p_project_id 
    AND position >= p_position;
  
  -- Insert the new shot at the specified position
  INSERT INTO shots (name, project_id, position)
  VALUES (p_shot_name, p_project_id, p_position)
  RETURNING id INTO v_shot_id;
  
  -- Return the results
  RETURN QUERY SELECT 
    v_shot_id,
    p_shot_name,
    p_position,
    TRUE;
    
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN QUERY SELECT 
    NULL::UUID,
    NULL::TEXT,
    NULL::INTEGER,
    FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION insert_shot_at_position(UUID, TEXT, INTEGER) TO authenticated;

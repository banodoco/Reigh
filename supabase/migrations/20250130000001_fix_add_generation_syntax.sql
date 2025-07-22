-- Fix syntax issues in add_generation_to_shot RPC function

DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION add_generation_to_shot(
  p_shot_id uuid,
  p_generation_id uuid,
  p_with_position boolean DEFAULT true
)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, "position" integer) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_pos integer;
  existing_record_id uuid;
  existing_position integer;
  result_id uuid;
  result_shot_id uuid;
  result_generation_id uuid;
  result_position integer;
BEGIN
  -- Check if this generation is already associated with this shot
  SELECT sg.id, sg."position" INTO existing_record_id, existing_position
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id;
  
  IF existing_record_id IS NOT NULL THEN
    -- Record already exists
    IF p_with_position AND existing_position IS NULL THEN
      -- Need to assign a position to existing record
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
      
      -- Update existing record with position
      UPDATE shot_generations 
      SET "position" = next_pos
      WHERE id = existing_record_id
      RETURNING id, shot_id, generation_id, "position" 
      INTO result_id, result_shot_id, result_generation_id, result_position;
    ELSE
      -- Return existing record as-is
      SELECT existing_record_id, p_shot_id, p_generation_id, existing_position
      INTO result_id, result_shot_id, result_generation_id, result_position;
    END IF;
  ELSE
    -- No existing record, create new one
    IF p_with_position THEN
      -- Get the next position for this shot
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
    ELSE
      -- Set position to NULL for unpositioned associations
      next_pos := NULL;
    END IF;
    
    -- Insert the new shot_generation record
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, next_pos)
    RETURNING id, shot_id, generation_id, "position"
    INTO result_id, result_shot_id, result_generation_id, result_position;
  END IF;
  
  -- Return the record (new or updated)
  RETURN QUERY SELECT 
    result_id,
    result_shot_id,
    result_generation_id,
    result_position;
END;
$$; 
-- Fix add_generation_to_shot RPC function to handle existing shot_generation records
-- This prevents duplicate records and ensures positions are assigned correctly

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
  existing_record record;
  result_record record;
BEGIN
  -- Check if this generation is already associated with this shot
  SELECT * INTO existing_record
  FROM shot_generations sg
  WHERE sg.shot_id = p_shot_id AND sg.generation_id = p_generation_id;
  
  IF FOUND THEN
    -- Record already exists
    IF p_with_position AND existing_record."position" IS NULL THEN
      -- Need to assign a position to existing record
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
      
      -- Update existing record with position
      UPDATE shot_generations 
      SET "position" = next_pos
      WHERE id = existing_record.id
      RETURNING * INTO result_record;
    ELSE
      -- Return existing record as-is
      result_record := existing_record;
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
    RETURNING * INTO result_record;
  END IF;
  
  -- Return the record (new or updated)
  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$; 
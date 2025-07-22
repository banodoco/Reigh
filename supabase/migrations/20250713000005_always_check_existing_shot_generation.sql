-- Update add_generation_to_shot to ALWAYS check for existing shot_id + generation_id first
DROP FUNCTION IF EXISTS add_generation_to_shot(uuid, uuid);
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
  existing_id uuid;
  new_record record;
BEGIN
  -- ALWAYS check for existing record first (regardless of p_with_position)
  SELECT id INTO existing_id
  FROM shot_generations
  WHERE shot_id = p_shot_id
    AND generation_id = p_generation_id
  LIMIT 1;
  
  IF existing_id IS NOT NULL THEN
    -- Record exists - update it based on p_with_position
    IF p_with_position THEN
      -- Get the next position for this shot
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
      
      -- Update existing record with position
      UPDATE shot_generations
      SET "position" = next_pos
      WHERE id = existing_id
      RETURNING * INTO new_record;
    ELSE
      -- Update existing record to have NULL position
      UPDATE shot_generations
      SET "position" = NULL
      WHERE id = existing_id
      RETURNING * INTO new_record;
    END IF;
  ELSE
    -- No existing record - create new one
    IF p_with_position THEN
      -- Get the next position for this shot
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
    ELSE
      -- Set position to NULL for unpositioned associations
      next_pos := NULL;
    END IF;
    
    -- Insert new record
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, next_pos)
    RETURNING * INTO new_record;
  END IF;
  
  -- Return the inserted or updated record
  RETURN QUERY SELECT 
    new_record.id,
    new_record.shot_id,
    new_record.generation_id,
    new_record."position";
END;
$$; 
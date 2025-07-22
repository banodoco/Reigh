-- Update add_generation_to_shot to check for existing NULL position and update if found when positioning
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
  IF p_with_position THEN
    -- Get the next position for this shot (with fully qualified column name)
    SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
    
    -- Check for existing record with NULL position
    SELECT id INTO existing_id
    FROM shot_generations
    WHERE shot_id = p_shot_id
      AND generation_id = p_generation_id
      AND "position" IS NULL
    LIMIT 1;
    
    IF existing_id IS NOT NULL THEN
      -- Update the existing record's position
      UPDATE shot_generations
      SET "position" = next_pos
      WHERE id = existing_id
      RETURNING * INTO new_record;
    ELSE
      -- Insert new record
      INSERT INTO shot_generations (shot_id, generation_id, "position")
      VALUES (p_shot_id, p_generation_id, next_pos)
      RETURNING * INTO new_record;
    END IF;
  ELSE
    -- Set position to NULL for unpositioned associations
    next_pos := NULL;
    
    -- Insert the new shot_generation record (no check here)
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, next_pos)
    RETURNING * INTO new_record;
  END IF;
  
  -- Return the inserted or updated record (only columns that exist)
  RETURN QUERY SELECT 
    new_record.id,
    new_record.shot_id,
    new_record.generation_id,
    new_record."position";
END;
$$; 
-- Clean version of add_generation_to_shot without debug logs
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
  IF p_with_position THEN
    -- Get the next position for this shot
    SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
    
    -- Check if there's an existing record with NULL position
    SELECT * INTO existing_record
    FROM shot_generations
    WHERE shot_generations.shot_id = p_shot_id 
      AND shot_generations.generation_id = p_generation_id 
      AND shot_generations."position" IS NULL
    LIMIT 1;
    
    IF existing_record IS NOT NULL THEN
      -- Update the existing record with the new position
      UPDATE shot_generations
      SET "position" = next_pos
      WHERE id = existing_record.id
      RETURNING * INTO result_record;
    ELSE
      -- Insert a new record
      INSERT INTO shot_generations (shot_id, generation_id, "position")
      VALUES (p_shot_id, p_generation_id, next_pos)
      RETURNING * INTO result_record;
    END IF;
  ELSE
    -- For p_with_position = false, just insert with NULL position
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, NULL)
    RETURNING * INTO result_record;
  END IF;
  
  -- Return the result record
  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$; 
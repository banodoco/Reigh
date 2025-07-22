-- Add function to position existing generation with NULL position in a shot
CREATE OR REPLACE FUNCTION position_existing_generation_in_shot(
  p_shot_id uuid,
  p_generation_id uuid
)
RETURNS TABLE(id uuid, shot_id uuid, generation_id uuid, "position" integer) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_pos integer;
  existing_id uuid;
  updated_record record;
BEGIN
  -- Check if there's an existing record with NULL position
  SELECT shot_generations.id INTO existing_id
  FROM shot_generations
  WHERE shot_generations.shot_id = p_shot_id 
    AND shot_generations.generation_id = p_generation_id 
    AND shot_generations."position" IS NULL
  LIMIT 1;
  
  IF existing_id IS NULL THEN
    -- No existing NULL position record found
    RAISE EXCEPTION 'No existing generation with NULL position found for shot_id: % and generation_id: %', p_shot_id, p_generation_id;
  END IF;
  
  -- Get the next position for this shot
  SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
  FROM shot_generations
  WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
  
  -- Update the existing record with the new position
  UPDATE shot_generations
  SET "position" = next_pos
  WHERE shot_generations.id = existing_id
  RETURNING * INTO updated_record;
  
  -- Return the updated record
  RETURN QUERY SELECT 
    updated_record.id,
    updated_record.shot_id,
    updated_record.generation_id,
    updated_record."position";
END;
$$; 
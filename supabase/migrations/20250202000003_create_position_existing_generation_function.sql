-- Create function to position an existing generation that has NULL position in a shot
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
  existing_record record;
BEGIN
  -- Find the existing record with NULL position
  SELECT * INTO existing_record
  FROM shot_generations
  WHERE shot_id = p_shot_id 
    AND generation_id = p_generation_id 
    AND "position" IS NULL
  LIMIT 1;
  
  IF existing_record IS NULL THEN
    -- No existing record with NULL position found
    RAISE EXCEPTION 'No existing shot_generation with NULL position found for shot_id % and generation_id %', p_shot_id, p_generation_id;
  END IF;
  
  -- Get the next position for this shot
  SELECT COALESCE(MAX("position") + 1, 0) INTO next_pos
  FROM shot_generations
  WHERE shot_id = p_shot_id 
    AND "position" IS NOT NULL;
  
  -- Update the existing record with the new position
  UPDATE shot_generations
  SET "position" = next_pos
  WHERE id = existing_record.id
  RETURNING * INTO existing_record;
  
  -- Return the updated record
  RETURN QUERY SELECT 
    existing_record.id,
    existing_record.shot_id,
    existing_record.generation_id,
    existing_record."position";
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION position_existing_generation_in_shot(uuid, uuid) IS 
'Updates an existing shot_generation record that has NULL position to assign it the next available position. 
This is used when viewing a shot with "Exclude items with a position" filter and adding one of those unpositioned items.'; 
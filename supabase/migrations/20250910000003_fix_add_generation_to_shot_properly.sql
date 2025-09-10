-- Fix add_generation_to_shot to properly handle existing records instead of always inserting
-- This is the root cause of duplicate shot_generation records

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
  result_record record;
BEGIN
  IF p_with_position THEN
    -- Check specifically for existing record with NULL position
    SELECT sg.id INTO existing_id
    FROM shot_generations sg
    WHERE sg.shot_id = p_shot_id 
      AND sg.generation_id = p_generation_id 
      AND sg."position" IS NULL
    LIMIT 1;
    
    IF existing_id IS NOT NULL THEN
      -- Found NULL position record, update it with position
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
      
      UPDATE shot_generations
      SET "position" = next_pos
      WHERE id = existing_id
      RETURNING * INTO result_record;
    ELSE
      -- No NULL position record found, create new positioned record
      SELECT COALESCE(MAX(shot_generations."position") + 1, 0) INTO next_pos
      FROM shot_generations
      WHERE shot_generations.shot_id = p_shot_id AND shot_generations."position" IS NOT NULL;
      
      INSERT INTO shot_generations (shot_id, generation_id, "position")
      VALUES (p_shot_id, p_generation_id, next_pos)
      RETURNING * INTO result_record;
    END IF;
  ELSE
    -- For unpositioned associations, always create new record with NULL position
    INSERT INTO shot_generations (shot_id, generation_id, "position")
    VALUES (p_shot_id, p_generation_id, NULL)
    RETURNING * INTO result_record;
  END IF;
  
  -- Return the record (either existing or new)
  RETURN QUERY SELECT 
    result_record.id,
    result_record.shot_id,
    result_record.generation_id,
    result_record."position";
END;
$$;
